"use strict";

var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
var fail = 0;

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function check(label, ok, extra) {
  if (!ok) {
    fail += 1;
    console.log("FAIL", label, extra || "");
  } else {
    console.log("ok", label);
  }
}

var form = read("encounter-form.html");
var list = read("encounter.html");
var js = read("functions/encounters.js");
var chrome = read("functions/app-bar.js");
var config = read("functions/workspace-config.js");
var css = read("style/style.css");
var narrativePage = read("functions/narratives/narrative-page.js");
var narrativeHtml = read("narrative.html");
var narrativeUi = read("functions/narratives/narrative-workspace-ui.js");
var narrativeLauncher = read("functions/narratives/encounter-launcher.js");

check("product version is 0.69.2", config.indexOf('productVersion: "0.69.2"') !== -1);
check("encounter form stamps 0.69.2", form.indexOf('data-version="0.69.2"') !== -1);
check("encounter list stamps 0.69.2", list.indexOf('data-version="0.69.2"') !== -1);

check(
  "workspace tabs",
  ["tab-stop", "tab-vehicles", "tab-subjects", "tab-evidence", "tab-narrative", "tab-review"].every(
    function (id) {
      return form.indexOf('id="' + id + '"') !== -1;
    }
  )
);
check("banner id and facts", form.indexOf("encBannerId") !== -1 && form.indexOf("encBannerFacts") !== -1);
check("operation select", form.indexOf('id="operationId"') !== -1);
check("officers table", form.indexOf('id="officerBody"') !== -1);
check("subjects table", form.indexOf('id="subjectBody"') !== -1);
check("add existing and add new", form.indexOf('id="openAddExisting"') !== -1 && form.indexOf('id="openAddSubject"') !== -1);
check("in-page subject float", form.indexOf('id="encSubjectFloat"') !== -1 && form.indexOf('id="encFloatFields"') !== -1);
check("float is not a browser popup", form.indexOf("window.open") === -1);
check("form does not link Add subject to Book-in", form.indexOf('href="bookin.html"') === -1);
check("form does not mount arrest roster", form.indexOf("arrestRosterHost") === -1);
check("vehicle disposition tiles", form.indexOf('data-field="encounterDisposition"') !== -1);
check("location center radio", form.indexOf('data-field="encounterCenter"') !== -1);
check("review confirm", form.indexOf('id="confirmEncounter"') !== -1);

check(
  "list page kept",
  list.indexOf('data-page="encounter"') !== -1 &&
    list.indexOf('id="encountersBody"') !== -1 &&
    list.indexOf('data-record-filter="complete"') !== -1 &&
    list.indexOf("Arrested subjects") !== -1
);
check("list row action is Open only", js.indexOf('link.textContent = "Open"') !== -1);
check(
  "list has no Edit or Delete actions",
  js.indexOf('complete ? "Open" : "Edit"') === -1 &&
    js.indexOf("deleteEncounterRecord(full.encounterId)") === -1
);
check(
  "list Add encounter stays in chrome",
  chrome.indexOf('href: "encounter-form.html"') !== -1 &&
    list.indexOf('id="encountersBody"') !== -1
);

check("operation change loads officers", js.indexOf("loadOfficersFromOperation") !== -1);
check("subjects painted from encounterSubjects", js.indexOf("encounterSubjects") !== -1);
check("collect does not rebuild subjects from packets", js.indexOf("record.subjects = subjectsForEncounter") === -1);
check("list still reads packets for arrested column", js.indexOf("subjectsForEncounter(full.encounterId)") !== -1);
check("add existing does not open Book-in", js.indexOf("does not open Book-in") !== -1);
check("add new upserts a person", js.indexOf("upsertPerson") !== -1);
check("add new does not saveLead", js.indexOf("saveLead") === -1);
check("add new does not open Book-in", js.indexOf("openSubjectBrowse") !== -1 && js.indexOf("openNewSubject") !== -1);
check("edit reopens the float", js.indexOf("openEditSubject") !== -1);
check("book float is in-page", form.indexOf('id="encBookFloat"') !== -1 && form.indexOf('id="confirmBookin"') !== -1);
check("book uses promoteBookInToLead", js.indexOf("promoteBookInToLead") !== -1);
check("book records officer field arrests", js.indexOf("recordFieldArrest") !== -1);
check("book is arrested only", js.indexOf("only for arrested") !== -1);
check("generate docs opens book-in packet", js.indexOf("Generate docs") !== -1);
check("evidence grid", form.indexOf('id="evidenceGrid"') !== -1 && form.indexOf('id="addEncounterFile"') !== -1);
check("evidence stays on the encounter", js.indexOf("ownerType=ENCOUNTER") !== -1);
check("review map host", form.indexOf('id="reviewMap"') !== -1);
check("unlock requires a reason", form.indexOf('id="unlockReason"') !== -1 && js.indexOf("unlockEncounter") !== -1);
check("confirm copy warns before lock", js.indexOf("Review all facts before confirming") !== -1);
check("seeds from operationId query", js.indexOf('queryParam("operationId")') !== -1);
check("seeds from leadId query", js.indexOf('queryParam("leadId")') !== -1);
check("seeds from personId query", js.indexOf('queryParam("personId")') !== -1);
check(
  "operation view adds an encounter",
  chrome.indexOf("encounter-form.html?operationId=") !== -1
);
check("case view adds an encounter", chrome.indexOf("encounter-form.html?leadId=") !== -1);
check("chrome form has no Save", /page === \"encounter-form\"[\s\S]{0,400}commitEncounter/.test(chrome) === false);
check("chrome form has no openEncounterBookIn", /page === \"encounter-form\"[\s\S]{0,800}openEncounterBookIn/.test(chrome) === false);
check("chrome form keeps Back to encounters", /page === \"encounter-form\"[\s\S]{0,400}Back to encounters/.test(chrome));
check("nav has no Book-in tab", chrome.indexOf('tabLink("bookin.html"') === -1);
check(
  "narrative tab opens the live Build 9 workspace",
  form.indexOf('id="tab-narrative"') !== -1 &&
    form.indexOf('id="openEncounterNarrativesButton"') !== -1 &&
    form.indexOf('functions/narratives/encounter-launcher.js') !== -1 &&
    narrativeLauncher.indexOf('"narrative.html?encounterId=" + encodeURIComponent(id)') !== -1 &&
    narrativeLauncher.indexOf('autosave.bind({ key: "encounter-form" })') !== -1 &&
    narrativeLauncher.indexOf('byId("tabbtn-narrative")') !== -1 &&
    narrativeLauncher.indexOf('tab.addEventListener("click", openWorkspace)') !== -1 &&
    narrativeLauncher.indexOf("event.stopPropagation()") !== -1 &&
    form.indexOf("narrativeEngineHost") === -1 &&
    form.indexOf("narrative-builder-engine.js") === -1
);
check("narrative tab does not iframe the engine", form.indexOf("narrativeFrame") === -1 && form.indexOf("<iframe") === -1);
check("encounter form does not boot Build 9", js.indexOf("bootWorkspace") === -1);
check(
  "narrative tab has no supervisor-summary note",
  form.indexOf("encounterSupervisorSummary") === -1 &&
    form.indexOf("No supervisor summary yet") === -1
);
check(
  "narrative draft popout uses window.open",
  narrativePage.indexOf("popoutDraftButton") !== -1 &&
    narrativePage.indexOf("window.open(") !== -1 &&
    narrativePage.indexOf("copdocxNarrativeDraft") !== -1 &&
    css.indexOf("narrative-draft-popped") !== -1
);
check(
  "narrative fact pane is installed",
  narrativeHtml.indexOf("functions/narratives/narrative-workspace-ui.js") !== -1 &&
    narrativeUi.indexOf("enhanceWorkspace") !== -1 &&
    css.indexOf(".narrative-input-pane") !== -1
);
check(
  "live narrative hides encounter-owned fields",
  narrativePage.indexOf("seedFromEncounter") !== -1 &&
    narrativeUi.indexOf("markEncounterOwnedFields") !== -1 &&
    css.indexOf("ui-encounter-owned") !== -1
);
check(
  "Build 9 engine stays on narrative.html",
  narrativeHtml.indexOf("functions/narratives/narrative-page.js") !== -1 &&
    narrativePage.indexOf("bootWorkspace") !== -1
);

if (fail) {
  process.exit(1);
}
console.log("all passed");
