/**
 * Shared app-bar: File / tabs / Admin dropdown / action slot.
 * Rules: docs/app-structure/chrome.md
 */
(function () {
  var ROSTER_FILE = [
    { label: "Import JSON", notBuilt: "Import JSON" },
    { label: "Export JSON", notBuilt: "Export JSON" }
  ];

  var ADMIN_LINKS = [
    {
      href: "admin.html",
      label: "Dashboard",
      pages: ["dashboard"]
    },
    {
      href: "officers.html",
      label: "Officers",
      pages: ["officers", "officer", "officer-form"]
    },
    {
      href: "vehicles.html",
      label: "Vehicles",
      pages: ["vehicles", "vehicle", "vehicle-form"]
    },
    {
      href: "schedule.html",
      label: "Schedule",
      pages: ["schedule"]
    }
  ];

  function pageKey() {
    return document.body.getAttribute("data-page") || "";
  }

  function queryId() {
    try {
      return new URLSearchParams(window.location.search).get("id") || "";
    } catch (error) {
      return "";
    }
  }

  function adminChildFor(page) {
    var i;
    for (i = 0; i < ADMIN_LINKS.length; i++) {
      if (ADMIN_LINKS[i].pages.indexOf(page) !== -1) {
        return ADMIN_LINKS[i].pages[0];
      }
    }
    return "";
  }

  function isAdminPage(page) {
    return Boolean(adminChildFor(page));
  }

  function isLeadPage(page) {
    return page === "leads" || page === "lead" || page === "lead-form";
  }

  function recordIdHref(path, id) {
    if (!id) {
      return path;
    }
    return path + "?id=" + encodeURIComponent(id);
  }

  function configFor(page) {
    var id = queryId();
    if (page === "leads") {
      return {
        tab: "leads",
        file: [
          { label: "Import JSON", notBuilt: "Import JSON" },
          { id: "downloadLeadsJsonButton", label: "Export JSON" },
          { id: "downloadLeadsCsvButton", label: "Download CSV" }
        ],
        actions: [
          {
            label: "Add lead",
            href: "lead-form.html",
            primary: true,
            chromeAction: "add"
          }
        ]
      };
    }
    if (page === "lead") {
      var actions = [
        {
          label: "Edit",
          href: recordIdHref("lead-form.html", id),
          primary: true,
          chromeAction: "edit"
        }
      ];
      if (id) {
        actions.push({
          id: "bookInLeadButton",
          label: "Book-in",
          href: "bookin.html?leadId=" + encodeURIComponent(id)
        });
      }
      return {
        tab: "leads",
        file: [
          { id: "downloadLeadButton", label: "Download JSON" },
          { id: "downloadLeadCsvButton", label: "Download CSV" }
        ],
        actions: actions
      };
    }
    if (page === "lead-form") {
      return {
        tab: "leads",
        file: [
          { id: "downloadLeadButton", label: "Download JSON" },
          { id: "downloadLeadCsvButton", label: "Download CSV" }
        ],
        actions: [
          { label: "Save", primary: true, chromeAction: "save" },
          {
            id: "appBarCancel",
            label: "Cancel",
            href: id ? recordIdHref("lead.html", id) : "leads.html"
          },
          { id: "stubPersonButton", label: "+ Person" },
          { id: "stubVehicleButton", label: "+ Vehicle" },
          { id: "stubLocationButton", label: "+ Location" },
          { id: "followUpsToggle", label: "Follow-ups", followUp: true }
        ]
      };
    }
    if (page === "bookin") {
      return {
        tab: "bookin",
        file: [
          { id: "bookInFileNew", label: "New", call: "startNewRecord" },
          {
            id: "saveRecordButton",
            label: "Save",
            call: "saveCurrentRecord"
          },
          {
            id: "openRecordsButton",
            label: "Open",
            call: "focusBookInRecords"
          }
        ],
        actions: [
          {
            id: "generateButton",
            label: "Generate",
            primary: true,
            chromeAction: "save",
            call: "generateCombinedPacket"
          },
          { label: "Clear", call: "confirmClearForm" },
          {
            id: "generatebaseballCard",
            label: "Baseball card",
            call: "onGenerateBaseballCard"
          }
        ]
      };
    }
    if (page === "map") {
      return {
        tab: "map",
        file: [
          { label: "Save PDF", notBuilt: "Save PDF" },
          { label: "Export KMZ (iTAK)", notBuilt: "Export KMZ (iTAK)" },
          { label: "Export JSON", notBuilt: "Export JSON" },
          { label: "Export CSV", notBuilt: "Export CSV" }
        ],
        actions: []
      };
    }
    if (page === "narrative") {
      return {
        tab: "narrative",
        file: [
          { id: "downloadNarrativeJsonButton", label: "Download JSON" },
          { id: "downloadNarrativeTextButton", label: "Download text" }
        ],
        actions: [
          {
            label: "Update draft",
            primary: true,
            chromeAction: "save"
          },
          { id: "addSupplementButton", label: "Add supplement" },
          { id: "inspectOutputButton", label: "Inspect output" }
        ]
      };
    }
    if (page === "baseballcard") {
      return {
        tab: "bookin",
        file: [{ label: "Export", notBuilt: "Export" }],
        actions: [
          {
            id: "generatebaseballCard",
            label: "Generate",
            primary: true,
            chromeAction: "save",
            call: "createBaseballText"
          }
        ]
      };
    }
    if (page === "dashboard" || page === "schedule") {
      return { tab: "admin", file: ROSTER_FILE, actions: [] };
    }
    if (page === "officers") {
      return {
        tab: "admin",
        file: ROSTER_FILE,
        actions: [
          {
            label: "Add officer",
            href: "officer-form.html",
            primary: true,
            chromeAction: "add"
          }
        ]
      };
    }
    if (page === "officer") {
      return {
        tab: "admin",
        file: ROSTER_FILE,
        actions: [
          {
            label: "Edit",
            href: recordIdHref("officer-form.html", id),
            primary: true,
            chromeAction: "edit"
          }
        ]
      };
    }
    if (page === "officer-form") {
      return {
        tab: "admin",
        file: ROSTER_FILE,
        actions: [
          { label: "Save", primary: true, chromeAction: "save" },
          {
            id: "appBarCancel",
            label: "Cancel",
            href: id
              ? recordIdHref("officer.html", id)
              : "officers.html"
          }
        ]
      };
    }
    if (page === "vehicles") {
      return {
        tab: "admin",
        file: ROSTER_FILE,
        actions: [
          {
            label: "Add vehicle",
            href: "vehicle-form.html",
            primary: true,
            chromeAction: "add"
          }
        ]
      };
    }
    if (page === "vehicle") {
      return {
        tab: "admin",
        file: ROSTER_FILE,
        actions: [
          {
            label: "Edit",
            href: recordIdHref("vehicle-form.html", id),
            primary: true,
            chromeAction: "edit"
          }
        ]
      };
    }
    if (page === "vehicle-form") {
      return {
        tab: "admin",
        file: ROSTER_FILE,
        actions: [
          { label: "Save", primary: true, chromeAction: "save" },
          {
            id: "appBarCancel",
            label: "Cancel",
            href: id
              ? recordIdHref("vehicle.html", id)
              : "vehicles.html"
          }
        ]
      };
    }
    return { tab: "", file: [], actions: [] };
  }

  function closeMenus(except) {
    document.querySelectorAll("details.app-bar-menu[open]").forEach(function (menu) {
      if (menu !== except) {
        menu.removeAttribute("open");
      }
    });
  }

  function setAppBarStatus(message, opts) {
    var el =
      document.getElementById("appBarStatus") ||
      document.getElementById("leadSaveStatus") ||
      document.getElementById("status");
    var ok = opts === true || (opts && opts.ok);
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
    el.classList.toggle("is-ok", Boolean(ok));
  }

  function bindCall(el, name) {
    if (!el || !name) {
      return;
    }
    el.dataset.chromeCall = "true";
    el.addEventListener("click", function () {
      var fn = window[name];
      if (typeof fn === "function") {
        fn();
      }
    });
  }

  function paintFileItem(item) {
    if (item.selectId) {
      var wrap = document.createElement("div");
      wrap.className = "app-bar-menu-open";
      var select = document.createElement("select");
      select.id = item.selectId;
      select.setAttribute("aria-label", item.selectLabel || "Saved records");
      var openBtn = document.createElement("button");
      openBtn.type = "button";
      if (item.id) {
        openBtn.id = item.id;
      }
      openBtn.textContent = item.label;
      bindCall(openBtn, item.call);
      wrap.appendChild(select);
      wrap.appendChild(openBtn);
      return wrap;
    }
    var btn = document.createElement("button");
    btn.type = "button";
    if (item.id) {
      btn.id = item.id;
    }
    btn.textContent = item.label;
    if (item.notBuilt) {
      btn.setAttribute("data-not-built", item.notBuilt);
    }
    bindCall(btn, item.call);
    return btn;
  }

  function paintAction(item) {
    var isLink = Boolean(item.href);
    var el = document.createElement(isLink ? "a" : "button");
    if (!isLink) {
      el.type = "button";
    } else {
      el.href = item.href;
    }
    if (item.primary) {
      el.id = "appBarPrimaryAction";
      el.className = "action-button";
    } else {
      el.className = "action-button-secondary";
      if (item.id) {
        el.id = item.id;
      }
    }
    if (item.chromeAction) {
      el.setAttribute("data-chrome-action", item.chromeAction);
    }
    if (item.followUp) {
      el.appendChild(document.createTextNode("Follow-ups "));
      var count = document.createElement("span");
      count.id = "followUpCount";
      count.textContent = "(0)";
      el.appendChild(count);
    } else {
      el.textContent = item.label;
    }
    bindCall(el, item.call);
    return el;
  }

  function paintTabs(page, tab) {
    var nav = document.createElement("nav");
    nav.id = "appBarNav";
    nav.className = "app-bar-nav";
    nav.setAttribute("aria-label", "Pages");

    function tabLink(href, label, current) {
      var a = document.createElement("a");
      a.href = href;
      a.textContent = label;
      if (current) {
        a.setAttribute("aria-current", "page");
      }
      return a;
    }

    nav.appendChild(tabLink("leads.html", "Leads", tab === "leads" || isLeadPage(page)));
    nav.appendChild(tabLink("bookin.html", "Book-in", tab === "bookin"));
    nav.appendChild(tabLink("map.html", "Map", tab === "map"));
    nav.appendChild(tabLink("narrative.html", "Narrative", tab === "narrative"));

    var admin = document.createElement("details");
    admin.className = "app-bar-menu";
    admin.id = "adminMenu";
    var summary = document.createElement("summary");
    summary.textContent = "Admin";
    if (tab === "admin" || isAdminPage(page)) {
      summary.setAttribute("aria-current", "page");
    }
    admin.appendChild(summary);
    var list = document.createElement("div");
    list.className = "app-bar-menu-list";
    ADMIN_LINKS.forEach(function (link) {
      var a = document.createElement("a");
      a.href = link.href;
      a.textContent = link.label;
      if (link.pages.indexOf(page) !== -1) {
        a.className = "is-current";
      }
      list.appendChild(a);
    });
    admin.appendChild(list);
    nav.appendChild(admin);
    return nav;
  }

  function mount(options) {
    options = options || {};
    var page = pageKey();
    var fallback = configFor(page);
    var tab = options.tab || fallback.tab;
    var file = options.file || fallback.file || [];
    var actions = options.actions || fallback.actions || [];
    var row = document.getElementById("appBarNavRow");
    if (!row) {
      return;
    }
    row.replaceChildren();

    var fileMenu = document.createElement("details");
    fileMenu.className = "app-bar-menu";
    fileMenu.id = "fileMenu";
    var fileSummary = document.createElement("summary");
    fileSummary.textContent = "File";
    fileMenu.appendChild(fileSummary);
    var fileList = document.createElement("div");
    fileList.className = "app-bar-menu-list";
    file.forEach(function (item) {
      fileList.appendChild(paintFileItem(item));
    });
    fileMenu.appendChild(fileList);
    row.appendChild(fileMenu);

    row.appendChild(paintTabs(page, tab));

    var actionWrap = document.createElement("div");
    actionWrap.id = "appBarActions";
    actionWrap.className = "app-bar-actions";
    actions.forEach(function (item) {
      actionWrap.appendChild(paintAction(item));
    });
    row.appendChild(actionWrap);
  }

  function mountFromPage() {
    if (!document.getElementById("appBarNavRow")) {
      return;
    }
    mount();
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
  window.COPDoc.chrome = {
    mount: mount,
    queryId: queryId,
    pageKey: pageKey,
    adminChildFor: adminChildFor
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountFromPage);
  } else {
    mountFromPage();
  }
})();
