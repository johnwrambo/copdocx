/** Read-only history and dependency lookup; never repairs or rewrites receipts. */
(function (global) {
  "use strict";
  var doc = global.document, api = global.COPDoc.documents;
  function el(id) { return doc.getElementById(id); }
  function node(tag, text) { var n = doc.createElement(tag); if (text !== undefined) n.textContent = text; return n; }
  function status(message) { el("documentHistoryStatus").textContent = message; }
  function refresh() {
    var body = el("documentHistoryBody"); body.textContent = "";
    try {
      var rows = api.list();
      rows.forEach(function (row) {
        var tr = node("tr"), registered = api.registry.get(row.documentType);
        tr.appendChild(node("td", row.startedAt));
        tr.appendChild(node("td", registered ? registered.title : row.documentType));
        tr.appendChild(node("td", row.status));
        var last = row.deliveries[row.deliveries.length - 1];
        tr.appendChild(node("td", last ? last.method + ": " + last.status : "No delivery recorded"));
        var td = node("td"), detail = node("details");
        detail.appendChild(node("summary", "View receipt"));
        var pre = node("pre", JSON.stringify(row, null, 2));
        pre.style.whiteSpace = "pre-wrap"; pre.style.overflowWrap = "anywhere";
        detail.appendChild(pre); td.appendChild(detail); tr.appendChild(td); body.appendChild(tr);
      });
      status(rows.length ? rows.length + " generation receipts. Generating officer is unknown unless an actual user identity was supplied." : "No generation receipts yet.");
    } catch (error) { status(error.message || "Document history could not be read."); }
  }
  function search() {
    var field = el("documentDependencyField").value.trim(), body = el("documentDependencyResults"); body.textContent = "";
    var matches = api.registry.dependentsOf(field);
    el("documentDependencyStatus").textContent = field ? matches.length + " affected document contracts. This is a reviewed dependency catalog; no match does not prove a field is unused." : "Enter a field path.";
    matches.forEach(function (entry) {
      var details = node("details"); details.appendChild(node("summary", entry.title));
      details.appendChild(node("p", entry.notes || "Direct inputs and upstream source dependencies."));
      var list = node("ul");
      entry.dependencies.forEach(function (dependency) {
        list.appendChild(node("li", dependency.field + " — " + dependency.authority + " (" + dependency.citation + ")"));
      });
      details.appendChild(list); body.appendChild(details);
    });
  }
  function exportReceipts() {
    try {
      var payload = { schema: "copdocx.document-receipts-export.v1", exportedAt: new Date().toISOString(), records: api.list() };
      var url = global.URL.createObjectURL(new global.Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
      var link = node("a"); link.href = url; link.download = "COPDoc-document-receipts.json";
      doc.body.appendChild(link); link.click(); link.remove();
      global.setTimeout(function () { global.URL.revokeObjectURL(url); }, 1000);
      status("Receipt export submitted to the browser. This file contains IDs and hashes, not document bodies.");
    } catch (error) { status(error.message || "Receipt export failed."); }
  }
  el("documentHistoryRefresh").addEventListener("click", refresh);
  el("documentHistoryExport").addEventListener("click", exportReceipts);
  el("documentDependencySearch").addEventListener("click", search);
  el("documentDependencyField").addEventListener("keydown", function (event) { if (event.key === "Enter") { event.preventDefault(); search(); } });
  global.addEventListener("storage", function (event) { if (event.key === api.storageKey || event.key === null) refresh(); });
  refresh();
})(window);
