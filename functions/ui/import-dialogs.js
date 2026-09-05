/** Import review and recovery dialogs. The application service owns all mutations. */
(function (global) {
  "use strict";
  var app = global.COPDoc = global.COPDoc || {};
  var ui = app.ui = app.ui || {};
  ui.createImportDialogs = function (service) {
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function refreshRecoveryUi() {
    if (!global.document || !global.document.body || !global.document.createElement) return;
    var guard = service.assertWritable(), old = global.document.getElementById("importRecoveryGuard");
    if (guard.ok) { if (old) old.remove(); return; }
    if (old) return;
    var panel = global.document.createElement("div"); panel.id = "importRecoveryGuard";
    panel.setAttribute("role", "alertdialog"); panel.setAttribute("aria-modal", "true");
    panel.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(10,20,30,.9);display:flex;align-items:center;justify-content:center;color:#17212b";
    var body = global.document.createElement("section"); body.style.cssText = "background:white;padding:24px;max-width:650px;border-radius:8px;font:16px Arial";
    var heading = global.document.createElement("h2"); heading.textContent = "Finish import recovery"; body.appendChild(heading);
    var status = global.document.createElement("p"); status.textContent = guard.error; body.appendChild(status);
    var result = service.listTransactions(), pending = result.ok && result.transactions.filter(function (row) { return row.status !== "COMPLETED" && row.status !== "ROLLED_BACK"; })[0];
    if (pending) ["Resume import", "Roll back import"].forEach(function (label, index) {
      var button = global.document.createElement("button"); button.textContent = label; button.style.marginRight = "12px";
      button.addEventListener("click", async function () { button.disabled = true; var answer = await (index ? service.rollback(pending.transactionId) : service.resume(pending.transactionId)); if (answer.ok && global.location && global.location.reload) global.location.reload(); else { status.textContent = answer.error; button.disabled = false; } });
      body.appendChild(button);
    });
    panel.appendChild(body); global.document.body.appendChild(panel);
  }
  function dialog(title) {
    if (!global.document || !global.document.body) return null;
    var overlay = global.document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483646;background:rgba(10,20,30,.8);display:flex;align-items:center;justify-content:center";
    var body = global.document.createElement("section");
    body.setAttribute("role", "dialog"); body.setAttribute("aria-modal", "true"); body.setAttribute("aria-label", title);
    body.style.cssText = "background:white;color:#17212b;padding:24px;border-radius:8px;max-width:850px;width:90%;max-height:85vh;overflow:auto;font:16px Arial";
    var heading = global.document.createElement("h2"); heading.textContent = title; body.appendChild(heading);
    overlay.appendChild(body); global.document.body.appendChild(overlay);
    return { overlay: overlay, body: body };
  }
  function paragraph(body, value) { var p = global.document.createElement("p"); p.textContent = value; body.appendChild(p); return p; }
  function finishButtons(view, confirmLabel, resolve, accept) {
    var yes = global.document.createElement("button"), no = global.document.createElement("button"), prior = global.document.activeElement;
    yes.textContent = confirmLabel; no.textContent = "Cancel"; yes.style.marginRight = "12px";
    function finish(value) { view.overlay.remove(); if (prior && prior.focus) prior.focus(); resolve(value); }
    yes.addEventListener("click", function () { finish(accept()); }); no.addEventListener("click", function () { finish(null); });
    view.body.appendChild(yes); view.body.appendChild(no);
    view.overlay.addEventListener("keydown", function (event) { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(null); } });
    no.focus();
  }
  async function reviewCustody(findings, initial) {
    var rows = (findings || []).filter(function (row) { return row.code === "CUSTODY_REVIEW"; }), view = dialog("Review booking outcomes");
    if (!view) return null;
    paragraph(view.body, "These records do not establish an arrested booking. Choose how each record should be imported. Existing linked records must keep their established identity.");
    var controls = [], decisions = clone(initial || {});
    rows.forEach(function (row) {
      var label = global.document.createElement("label"), select = global.document.createElement("select");
      label.textContent = row.recordId + " "; label.style.cssText = "display:block;margin:14px 0";
      [["draft", "Keep as an unfiled draft"], ["ARRESTED", "Confirm this is an arrested booking"]].forEach(function (choice) { var option = global.document.createElement("option"); option.value = choice[0]; option.textContent = choice[1]; select.appendChild(option); });
      label.appendChild(select); view.body.appendChild(label); controls.push({ id: row.recordId, select: select });
    });
    return new Promise(function (resolve) { finishButtons(view, "Review import", resolve, function () { controls.forEach(function (row) { decisions[row.id] = row.select.value === "ARRESTED" ? { outcome: "ARRESTED" } : { keepDraft: true }; }); return decisions; }); });
  }
  async function preview(plan) {
    if (!plan || !plan.ok) return false;
    var rows = plan.rows || [], counts = { create: 0, update: 0, skip: 0 };
    rows.forEach(function (row) { if (counts[row.action] !== undefined) counts[row.action] += 1; });
    var summary = counts.create + " create, " + counts.update + " update, " + counts.skip + " skip. " + plan.changes.length + " stores; " + (plan.mediaPlans || []).length + " Media items.";
    var view = dialog("Import preview");
    if (!view) return typeof global.confirm === "function" ? global.confirm(summary + " Apply this import?") : false;
    paragraph(view.body, summary);
    paragraph(view.body, "A recovery checkpoint preserves the existing values before any changes. Required related records are included below.");
    var table = global.document.createElement("table"); table.style.cssText = "width:100%;border-collapse:collapse;margin:18px 0;text-align:left";
    var head = global.document.createElement("tr");
    ["Type", "Record", "Action"].forEach(function (text) { var cell = global.document.createElement("th"); cell.textContent = text; cell.style.padding = "8px"; head.appendChild(cell); }); table.appendChild(head);
    rows.forEach(function (row) { var tr = global.document.createElement("tr"); [row.type || "record", row.label || row.recordId || "", row.action || "review"].forEach(function (text) { var cell = global.document.createElement("td"); cell.textContent = text; cell.style.cssText = "padding:8px;border-top:1px solid #d1d5db;overflow-wrap:anywhere"; tr.appendChild(cell); }); table.appendChild(tr); });
    view.body.appendChild(table);
    (plan.findings || []).forEach(function (finding) { paragraph(view.body, (finding.recordId ? finding.recordId + ": " : "") + (finding.message || finding.code)); });
    return new Promise(function (resolve) { finishButtons(view, "Apply import", resolve, function () { return true; }); });
  }
  return { preview: preview, reviewCustody: reviewCustody, refreshRecoveryUi: refreshRecoveryUi };
  };
})(typeof window !== "undefined" ? window : globalThis);
