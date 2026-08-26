/**
 * Show only Lead Source fields that belong to the selected source.
 * Probation is LE referral only.
 */

function updateLeadSourceFields() {
  var select = document.getElementById("leadSource");
  if (!select) {
    return;
  }
  var source = select.value;

  document.querySelectorAll("[data-source]").forEach(function (panel) {
    var allowed = String(panel.getAttribute("data-source") || "").split(/\s+/);
    panel.hidden = !source || allowed.indexOf(source) === -1;
  });

  if (source !== "otherLe") {
    var probation = document.getElementById("probationCheck");
    if (probation) {
      probation.checked = false;
    }
  }
}

var leadSourceSelect = document.getElementById("leadSource");
if (leadSourceSelect) {
  leadSourceSelect.addEventListener("change", updateLeadSourceFields);
  updateLeadSourceFields();
}
