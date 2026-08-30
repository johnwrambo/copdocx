function activeCatalog(items) {
  return (items || []).filter(function (item) {
    return typeof item !== "object" || item.active !== false;
  });
}

function fillSelect(select, items, placeholderText, getValue, getLabel) {
  if (!select) {
    return;
  }
  select.replaceChildren();

  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.textContent = placeholderText;
  select.appendChild(placeholderOption);

  items.forEach(function (item) {
    const option = document.createElement("option");
    option.value = getValue
      ? getValue(item)
      : item.code != null
        ? item.code
        : String(item);
    option.textContent = getLabel
      ? getLabel(item)
      : item.label != null
        ? item.label
        : String(item);
    select.appendChild(option);
  });
}

function formatLicensePlate(el) {
  if (!el) {
    return "";
  }
  var next = String(el.value || "").toUpperCase();
  if (next !== el.value) {
    var pos = el.selectionStart;
    el.value = next;
    if (typeof el.setSelectionRange === "function" && pos != null) {
      try {
        el.setSelectionRange(pos, pos);
      } catch (error) {}
    }
  }
  return el.value;
}

function bindLicensePlateField(el) {
  if (!el || el.dataset.plateBound === "true") {
    return;
  }
  el.dataset.plateBound = "true";
  el.setAttribute("autocapitalize", "characters");
  el.setAttribute("spellcheck", "false");
  formatLicensePlate(el);
  el.addEventListener("input", function () {
    formatLicensePlate(el);
  });
  el.addEventListener("blur", function () {
    formatLicensePlate(el);
  });
}

function bindVehicleCard(card) {
  if (!card || card.dataset.vehicleBound) {
    return;
  }
  card.dataset.vehicleBound = "true";

  function field(name) {
    return card.querySelector('[data-field="' + name + '"]');
  }

  bindLicensePlateField(field("licensePlate"));

  const reasonSelect = field("vehicleAssociationReason");
  const plateStateSelect = field("plateState");
  const yearSelect = field("vehicleYear");
  const makeSelect = field("vehicleMake");
  const modelSelect = field("vehicleModel");
  const colorSelect = field("vehicleColor");
  const bodySelect = field("vehicleBodyStyle");

  function fillModelOptions() {
    const make = makeSelect ? makeSelect.value : "";
    if (!make) {
      fillSelect(modelSelect, [], "Select a Make first");
      return;
    }
    const models =
      typeof modelsForMake === "function" ? modelsForMake(make) : [];
    fillSelect(modelSelect, models, "Select a Model");
  }

  function fillBodyStyleOptions() {
    const make = makeSelect ? makeSelect.value : "";
    const model = modelSelect ? modelSelect.value : "";
    const styles =
      typeof bodyStylesForMakeModel === "function"
        ? bodyStylesForMakeModel(make, model)
        : typeof VEHICLE_BODY_STYLES !== "undefined"
          ? VEHICLE_BODY_STYLES
          : [];
    fillSelect(bodySelect, styles, "Select a Body Style");
  }

  fillSelect(
    reasonSelect,
    typeof VEHICLE_ASSOCIATION_REASONS !== "undefined"
      ? VEHICLE_ASSOCIATION_REASONS
      : [],
    "Select a Reason"
  );

  fillSelect(
    plateStateSelect,
    activeCatalog(typeof US_STATES !== "undefined" ? US_STATES : []),
    "Select a State",
    function (state) {
      return state.code;
    },
    function (state) {
      return state.code + " — " + state.label;
    }
  );

  fillSelect(
    yearSelect,
    typeof VEHICLE_YEARS !== "undefined" ? VEHICLE_YEARS : [],
    "Select a Year"
  );
  fillSelect(
    makeSelect,
    activeCatalog(typeof VEHICLE_MAKES !== "undefined" ? VEHICLE_MAKES : []),
    "Select a Make"
  );
  fillSelect(
    colorSelect,
    activeCatalog(typeof VEHICLE_COLORS !== "undefined" ? VEHICLE_COLORS : []),
    "Select a Color"
  );

  fillModelOptions();
  fillBodyStyleOptions();

  if (makeSelect) {
    makeSelect.addEventListener("change", function () {
      fillModelOptions();
      fillBodyStyleOptions();
    });
  }
  if (modelSelect) {
    modelSelect.addEventListener("change", function () {
      fillBodyStyleOptions();
    });
  }

}
