/**
 * Shared app-bar: File / tabs / Admin dropdown / action slot.
 * Rules: docs/app-structure/chrome.md
 */
(function () {
  var WORKSPACE_FILE = [
    { id: "fileImportButton", label: "Import", call: "openFileImport" },
    { id: "fileExportButton", label: "Export", call: "openFileExport" }
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
    return (
      page === "leads" ||
      page === "lead" ||
      page === "case" ||
      page === "lead-form" ||
      page === "mobile-target-sheet" ||
      page === "i200-form" ||
      page === "i205-form"
    );
  }

  function isEncounterPage(page) {
    return page === "encounter" || page === "encounter-form" || page === "narrative";
  }

  function isInvestigatePage(page) {
    return page === "investigations" || page === "investigate";
  }

  function isOperationPage(page) {
    return (
      page === "operations" ||
      page === "operation" ||
      page === "operation-form" ||
      page === "operation-brief"
    );
  }

  function queryParam(name) {
    try {
      return new URLSearchParams(window.location.search).get(name) || "";
    } catch (error) {
      return "";
    }
  }

  function recordIdHref(path, id) {
    if (!id) {
      return path;
    }
    return path + "?id=" + encodeURIComponent(id);
  }

  function hasCommittedAt(meta) {
    return !!(meta && String(meta.committedAt || "").trim());
  }

  function leadHasCommittedAt(leadId) {
    if (!leadId) {
      return false;
    }
    try {
      var model = window.COPDoc && COPDoc.model;
      if (!model || !model.store || typeof model.store.getLead !== "function") {
        return false;
      }
      if (typeof model.store.loadFromDisk === "function") {
        model.store.loadFromDisk();
      }
      var snap = model.store.getLead(leadId);
      return hasCommittedAt(snap && snap.meta);
    } catch (error) {
      return false;
    }
  }

  function adminRecordHasCommittedAt(kind, id) {
    if (!id) {
      return false;
    }
    try {
      var raw = localStorage.getItem("copdoc.admin.v1");
      var admin = raw ? JSON.parse(raw) : {};
      var list = kind === "officer" ? admin.officers : admin.vehicles;
      var i;
      for (i = 0; i < (list || []).length; i++) {
        var row = list[i];
        if (!row) {
          continue;
        }
        if (row.id === id || row.officerId === id || row.vehicleId === id) {
          return hasCommittedAt(row.meta);
        }
      }
    } catch (error) {
      return false;
    }
    return false;
  }

  function backAction(label, href) {
    return {
      id: "appBarBack",
      label: label,
      href: href
    };
  }

  function mediaPickerChrome(kind) {
    var ownerType = String(queryParam("ownerType") || "").toUpperCase();
    var ownerId = queryParam("id") || queryParam("recordId");
    var leadId = queryParam("leadId");
    var encounterId = queryParam("encounterId");
    var hasOwner = !!(ownerType || leadId);
    var returnTo = queryParam("return");
    if (returnTo && !/^[a-z0-9._-]+\.html(?:\?.*)?$/i.test(returnTo)) {
      returnTo = "";
    }
    var tab = "";
    if (leadId || ownerType === "PERSON" || ownerType === "LEAD") {
      tab = "leads";
    } else if (ownerType === "ENCOUNTER" || encounterId) {
      tab = "encounter";
    } else if (ownerType === "BOOKIN") {
      tab = "bookin";
    } else if (ownerType === "OFFICER" || ownerType === "VEHICLE") {
      tab = "admin";
    }
    var actions = [];
    if (hasOwner) {
      actions.push({
        id: kind === "file" ? "saveFileButton" : "savePhotoButton",
        label: kind === "file" ? "Save file" : "Save photo",
        primary: true,
        chromeAction: "save",
        call: kind === "file" ? "saveFilesToOwner" : "savePhotosToOwner"
      });
      actions.push({
        label: kind === "file" ? "Add files" : "Add photos",
        call: kind === "file" ? "openFileUpload" : "openPhotoPicker"
      });
      if (returnTo) {
        var backLabel = "Back";
        if (returnTo.indexOf("lead-form") === 0) {
          backLabel = "Back to case";
        } else if (returnTo.indexOf("officer-form") === 0) {
          backLabel = "Back to officer";
        } else if (returnTo.indexOf("vehicle-form") === 0) {
          backLabel = "Back to vehicle";
        } else if (returnTo.indexOf("lead.html") === 0 || returnTo.indexOf("case.html") === 0) {
          backLabel = "Back to case";
        } else if (returnTo.indexOf("officer.html") === 0) {
          backLabel = "Back to officer";
        } else if (returnTo.indexOf("vehicle.html") === 0) {
          backLabel = "Back to vehicle";
        }
        actions.push(backAction(backLabel, returnTo));
      } else if (leadId) {
        actions.push(backAction("Back to case", recordIdHref("case.html", leadId)));
      } else if (encounterId || ownerType === "ENCOUNTER") {
        actions.push(
          backAction(
            "Back to encounter",
            recordIdHref("encounter-form.html", encounterId || ownerId)
          )
        );
      } else if (ownerType === "OFFICER") {
        actions.push(backAction("Back to officer", recordIdHref("officer.html", ownerId)));
      } else if (ownerType === "VEHICLE") {
        actions.push(backAction("Back to vehicle", recordIdHref("vehicle.html", ownerId)));
      } else if (ownerType === "BOOKIN") {
        actions.push(
          backAction(
            "Back to book-in",
            "bookin.html?recordId=" + encodeURIComponent(ownerId)
          )
        );
      }
    } else {
      actions.push({
        label: kind === "file" ? "Add files" : "Add photos",
        primary: true,
        chromeAction: "add",
        call: kind === "file" ? "openFileUpload" : "openPhotoPicker"
      });
    }
    return {
      tab: tab,
      file:
        kind === "file"
          ? [
              { id: "downloadFileLibraryButton", label: "Download JSON" },
              { id: "clearFileLibraryButton", label: "Clear library" }
            ]
          : [
              { id: "downloadPhotoLibraryButton", label: "Download JSON" },
              { id: "clearPhotoLibraryButton", label: "Clear library" }
            ],
      actions: actions
    };
  }

  function withQuery(path, params) {
    var parts = [];
    var key;
    for (key in params) {
      if (Object.prototype.hasOwnProperty.call(params, key) && params[key]) {
        parts.push(key + "=" + encodeURIComponent(params[key]));
      }
    }
    return parts.length ? path + "?" + parts.join("&") : path;
  }

  function configFor(page) {
    var id = queryId();
    if (page === "home") {
      return {
        tab: "home",
        file: WORKSPACE_FILE,
        actions: []
      };
    }
    if (page === "encounter") {
      return {
        tab: "encounter",
        file: WORKSPACE_FILE,
        actions: [
          {
            label: "Add encounter",
            href: "encounter-form.html",
            primary: true,
            chromeAction: "add"
          }
        ]
      };
    }
    if (page === "encounter-form") {
      return {
        tab: "encounter",
        file: WORKSPACE_FILE,
        actions: [
          {
            label: "Save",
            primary: true,
            chromeAction: "save",
            call: "commitEncounter"
          },
          backAction("Back to encounters", "encounter.html"),
          {
            id: "addEncounterSubjectsButton",
            label: "Add subject",
            call: "openEncounterBookIn"
          },
          {
            id: "generateI213Button",
            label: "Generate I-213",
            call: "generateEncounterNarrative"
          }
        ]
      };
    }
    if (page === "operations") {
      return {
        tab: "operations",
        file: WORKSPACE_FILE,
        actions: [
          {
            label: "Add operation",
            href: "operation-form.html",
            primary: true,
            chromeAction: "add"
          }
        ]
      };
    }
    if (page === "operation-form") {
      return {
        tab: "operations",
        file: WORKSPACE_FILE,
        actions: [
          {
            label: "Save",
            primary: true,
            chromeAction: "save",
            call: "commitOperation"
          },
          backAction("Back to operations", "operations.html")
        ]
      };
    }
    if (page === "operation") {
      return {
        tab: "operations",
        file: WORKSPACE_FILE,
        actions: [
          {
            label: "Edit",
            href: recordIdHref("operation-form.html", id),
            primary: true,
            chromeAction: "edit"
          },
          backAction("Back to operations", "operations.html"),
          {
            label: "Generate brief",
            call: "generateOperationBrief"
          }
        ]
      };
    }
    if (page === "investigations") {
      return {
        tab: "investigate",
        file: WORKSPACE_FILE,
        actions: [
          {
            label: "Add investigation",
            href: "investigate.html",
            primary: true,
            chromeAction: "add"
          }
        ]
      };
    }
    if (page === "investigate") {
      var investigateActions = [
        {
          label: "Save",
          primary: true,
          chromeAction: "save",
          call: "commitInvestigation"
        },
        backAction("Back to investigations", "investigations.html")
      ];
      investigateActions.push({
        label: "Import plates",
        call: "focusPlateImport"
      });
      investigateActions.push({
        label: "Spawn",
        call: "spawnChildInvestigation"
      });
      investigateActions.push({
        label: "Open as case",
        call: "openInvestigationPersonAsCase"
      });
      investigateActions.push({
        label: "Clear all",
        call: "clearInvestigationWorkspace"
      });
      return {
        tab: "investigate",
        file: WORKSPACE_FILE,
        actions: investigateActions
      };
    }
    if (page === "leads") {
      return {
        tab: "leads",
        file: WORKSPACE_FILE,
        actions: [
          {
            label: "Add case",
            href: "lead-form.html",
            primary: true,
            chromeAction: "add"
          }
        ]
      };
    }
    if (page === "lead" || page === "case") {
      var actions = [
        {
          label: "Edit",
          href: recordIdHref("lead-form.html", id),
          primary: true,
          chromeAction: "edit"
        },
        backAction("Back to cases", "leads.html")
      ];
      if (id) {
        actions.push({
          id: "generateTargetSheetButton",
          label: "Generate Target sheet",
          href: recordIdHref("mobile-target-sheet.html", id),
          target: "_blank",
          rel: "noopener"
        });
        actions.push({
          id: "bookInLeadButton",
          label: "Book-in",
          href: "bookin.html?leadId=" + encodeURIComponent(id)
        });
        actions.push({
          id: "issueI200Button",
          label: "Issue I-200",
          href: "i200-form.html?id=" + encodeURIComponent(id)
        });
        actions.push({
          id: "issueI205Button",
          label: "Issue I-205",
          href: "i205-form.html?id=" + encodeURIComponent(id)
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
    if (page === "mobile-target-sheet") {
      var targetSheetActions = [];
      if (id) {
        targetSheetActions.push({
          label: "Edit case",
          href: recordIdHref("lead-form.html", id),
          primary: true,
          chromeAction: "edit"
        });
        targetSheetActions.push(backAction("Back to case", recordIdHref("case.html", id)));
      } else {
        targetSheetActions.push(backAction("Back to cases", "leads.html"));
      }
      return {
        tab: "leads",
        file: [
          {
            id: "downloadTargetSheetButton",
            label: "Save Target sheet",
            call: "saveTargetSheet"
          }
        ],
        actions: targetSheetActions.concat([
          {
            id: "saveTargetSheetButton",
            label: "Save Target sheet",
            call: "saveTargetSheet"
          }
        ])
      };
    }
    if (page === "i200-form" || page === "i205-form") {
      return {
        tab: "leads",
        file: [
          {
            id: "downloadWarrantPdfButton",
            label: "Download PDF",
            call: "downloadWarrantPdf"
          }
        ],
        actions: [
          {
            label: "Issue",
            primary: true,
            chromeAction: "save",
            call: "issueWarrant"
          },
          id
            ? backAction("Back to case", recordIdHref("case.html", id))
            : backAction("Back to cases", "leads.html")
        ]
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
          leadHasCommittedAt(id)
            ? backAction("Back to case", recordIdHref("case.html", id))
            : backAction("Back to cases", "leads.html")
        ]
      };
    }
    if (page === "bookin") {
      var encounterId = queryParam("encounterId");
      var bookinLeadId = queryParam("leadId");
      var bookinActions = [
        {
          id: "saveRecordButton",
          label: "Save",
          primary: true,
          chromeAction: "save",
          call: "saveCurrentRecord"
        }
      ];
      if (encounterId) {
        bookinActions.push(
          backAction(
            "Back to encounter",
            recordIdHref("encounter-form.html", encounterId)
          )
        );
        bookinActions.push({
          id: "addAnotherEncounterSubjectButton",
          label: "Add another subject",
          call: "addAnotherEncounterSubject"
        });
      } else if (bookinLeadId) {
        bookinActions.push(
          backAction("Back to case", recordIdHref("case.html", bookinLeadId))
        );
      }
      bookinActions.push({
        id: "generateButton",
        label: "Generate",
        call: "generateCombinedPacket"
      });
      bookinActions.push({
        id: "loadLeadIntoEncounterButton",
        label: "Load from cases",
        call: "openLoadLeadForEncounter"
      });
      bookinActions.push({ label: "Clear", call: "confirmClearForm" });
      bookinActions.push({
        id: "generatebaseballCard",
        label: "Baseball card",
        call: "openBaseballCard"
      });
      return {
        tab: "bookin",
        file: WORKSPACE_FILE.concat([
          { id: "bookInFileNew", label: "New", call: "startNewRecord" },
          {
            id: "openRecordsButton",
            label: "Open",
            call: "focusBookInRecords"
          }
        ]),
        actions: bookinActions
      };
    }
    if (page === "map") {
      return {
        tab: "map",
        file: [
          { id: "printMapBriefFile", label: "Print brief", call: "printMapBrief" },
          { label: "Export KMZ (iTAK)", notBuilt: "Export KMZ (iTAK)" },
          { label: "Export JSON", notBuilt: "Export JSON" },
          { label: "Export CSV", notBuilt: "Export CSV" }
        ],
        actions: [
          { id: "mapBriefButton", label: "Brief view" },
          {
            id: "mapPrintBriefButton",
            label: "Print brief",
            primary: true,
            chromeAction: "save",
            call: "printMapBrief"
          }
        ]
      };
    }
    if (page === "narrative") {
      var narrativeEncounterId = queryParam("encounterId");
      var narrativeActions = [
        {
          label: narrativeEncounterId ? "Save I-213" : "Update draft",
          primary: true,
          chromeAction: "save"
        }
      ];
      if (narrativeEncounterId) {
        narrativeActions.push(
          backAction(
            "Back to encounter",
            recordIdHref("encounter-form.html", narrativeEncounterId)
          )
        );
      }
      narrativeActions.push({ id: "copyNarrativeButton", label: "Copy" });
      return {
        tab: "encounter",
        file: [
          { id: "downloadNarrativeJsonButton", label: "Download JSON" },
          { id: "downloadNarrativeTextButton", label: "Download text" }
        ],
        actions: narrativeActions
      };
    }
    if (page === "file-upload" || page === "photo-picker") {
      return mediaPickerChrome(page === "file-upload" ? "file" : "photo");
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
            call: "persistBaseballCard"
          },
          backAction(
            "Back to book-in",
            withQuery("bookin.html", {
              encounterId: queryParam("encounterId"),
              leadId: queryParam("leadId")
            })
          )
        ]
      };
    }
    if (page === "dashboard" || page === "schedule") {
      return { tab: "admin", file: WORKSPACE_FILE, actions: [] };
    }
    if (page === "officers") {
      return {
        tab: "admin",
        file: WORKSPACE_FILE,
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
        file: WORKSPACE_FILE,
        actions: [
          {
            label: "Edit",
            href: recordIdHref("officer-form.html", id),
            primary: true,
            chromeAction: "edit"
          },
          backAction("Back to officers", "officers.html")
        ]
      };
    }
    if (page === "officer-form") {
      return {
        tab: "admin",
        file: WORKSPACE_FILE,
        actions: [
          { label: "Save", primary: true, chromeAction: "save" },
          adminRecordHasCommittedAt("officer", id)
            ? backAction("Back to officer", recordIdHref("officer.html", id))
            : backAction("Back to officers", "officers.html")
        ]
      };
    }
    if (page === "vehicles") {
      return {
        tab: "admin",
        file: WORKSPACE_FILE,
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
        file: WORKSPACE_FILE,
        actions: [
          {
            label: "Edit",
            href: recordIdHref("vehicle-form.html", id),
            primary: true,
            chromeAction: "edit"
          },
          backAction("Back to vehicles", "vehicles.html")
        ]
      };
    }
    if (page === "vehicle-form") {
      return {
        tab: "admin",
        file: WORKSPACE_FILE,
        actions: [
          { label: "Save", primary: true, chromeAction: "save" },
          adminRecordHasCommittedAt("vehicle", id)
            ? backAction("Back to vehicle", recordIdHref("vehicle.html", id))
            : backAction("Back to vehicles", "vehicles.html")
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
      if (item.target) {
        el.target = item.target;
        el.rel = item.rel || "noopener";
      }
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
    if (item.hidden) {
      el.hidden = true;
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

    nav.appendChild(tabLink("home.html", "Home", tab === "home" || page === "home"));
    nav.appendChild(tabLink("leads.html", "Cases", tab === "leads" || isLeadPage(page)));
    nav.appendChild(
      tabLink(
        "investigations.html",
        "Investigate",
        tab === "investigate" || isInvestigatePage(page)
      )
    );
    nav.appendChild(
      tabLink(
        "encounter.html",
        "Encounters",
        tab === "encounter" || isEncounterPage(page)
      )
    );
    nav.appendChild(
      tabLink(
        "operations.html",
        "Operations",
        tab === "operations" || isOperationPage(page)
      )
    );
    nav.appendChild(tabLink("bookin.html", "Book-in", tab === "bookin"));
    nav.appendChild(tabLink("map.html", "Map", tab === "map"));

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
