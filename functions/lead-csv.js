/**
 * Download the current lead as a one-row CSV (subject + source + first plate).
 * Nested cards stay in the JSON download.
 */
function csvEscape(value) {
  var text = String(value == null ? "" : value);
  if (/[",\n\r]/.test(text)) {
    return '"' + text.replace(/"/g, '""') + '"';
  }
  return text;
}

function downloadCurrentLeadCsv() {
  var model = window.COPDoc && COPDoc.model;
  if (!model || !model.store) {
    return;
  }
  var card = document.querySelector('[data-card="lead"]');
  var leadId = card && card.dataset.leadId;
  var snapshot = leadId ? model.store.getLead(leadId) : null;
  if (!snapshot || (model.isCommitted && !model.isCommitted(snapshot))) {
    if (window.COPDoc && typeof COPDoc.setAppBarStatus === "function") {
      COPDoc.setAppBarStatus("Commit the lead before exporting.");
    }
    return;
  }
  var person = model.subjectOf(snapshot) || {};
  var name = person.name || {};
  var immigration = person.immigration || {};
  var source = snapshot.source || {};
  var vehicle = (snapshot.vehicles && snapshot.vehicles[0]) || {};
  var headers = [
    "lastName",
    "firstName",
    "middleName",
    "sex",
    "dateOfBirth",
    "age",
    "citizenship",
    "alienNumber",
    "caseNumber",
    "leadSource",
    "licensePlate",
    "plateState"
  ];
  var row = [
    name.lastName,
    name.firstName,
    name.middleName,
    person.sex,
    person.dateOfBirth,
    person.age,
    person.citizenship,
    immigration.alienNumber,
    source.caseNumber,
    source.leadSource,
    vehicle.licensePlate || vehicle.plate,
    vehicle.plateState || vehicle.state
  ];
  var csv = headers.join(",") + "\r\n" + row.map(csvEscape).join(",") + "\r\n";
  var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  var url = URL.createObjectURL(blob);
  var link = document.createElement("a");
  var label = model.formatPersonLabel
    ? model.formatPersonLabel(person)
    : "";
  var slug = (label || "untitled-lead")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  link.href = url;
  link.download = slug + ".csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  if (window.COPDoc && typeof COPDoc.setAppBarStatus === "function") {
    COPDoc.setAppBarStatus("Downloaded CSV snapshot.", { ok: true });
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("downloadLeadCsvButton");
    if (btn) {
      btn.addEventListener("click", downloadCurrentLeadCsv);
    }
  });
}
