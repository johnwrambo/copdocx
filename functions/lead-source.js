/**
 * Show only Lead Source fields that belong to the selected source.
 * Probation is LE referral only.
 */

var SOURCE_LABELS = {
  tag: "Plate Check",
  otherLe: "Other Law Enforcement Agency",
  elite: "Elite",
  other: "Other",
  discovered: "Discovered in case"
};

function sourceLabel(code) {
  var key = String(code || "");
  return SOURCE_LABELS[key] || key;
}

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

  if (typeof refreshAddressAssociationOptions === "function") {
    refreshAddressAssociationOptions();
  }
  if (typeof applyLeadLane === "function") {
    applyLeadLane();
  }
}

var leadSourceSelect = document.getElementById("leadSource");
if (leadSourceSelect) {
  leadSourceSelect.addEventListener("change", updateLeadSourceFields);
  updateLeadSourceFields();
}

var addPlateCheckLocationButton = document.getElementById(
  "addPlateCheckLocation"
);
if (addPlateCheckLocationButton) {
  addPlateCheckLocationButton.addEventListener("click", function () {
    if (typeof addPlateCheckAddress === "function") {
      addPlateCheckAddress();
    }
  });
}
