/** Compatibility entry point. CSV data capture, rendering and tracking live in leads.js. */
function downloadCurrentLeadCsv() {
  var api = window.COPDoc && COPDoc.leadDocuments;
  if (api && typeof api.exportOneCsv === "function") {
    return api.exportOneCsv();
  }
  if (window.COPDoc && COPDoc.setAppBarStatus) {
    COPDoc.setAppBarStatus("The case CSV exporter could not be loaded. Reload this page.");
  }
  return Promise.resolve(null);
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("downloadLeadCsvButton");
    if (btn && btn.dataset.csvExportBound !== "true") {
      btn.dataset.csvExportBound = "true";
      btn.addEventListener("click", downloadCurrentLeadCsv);
    }
  });
}
