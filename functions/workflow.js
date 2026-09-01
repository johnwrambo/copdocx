/**
 * Lead-entry workflow: source lane, stage collapse, on-page jump nav.
 *
 * Plate Check → vehicle first. LE / Elite / Other → subject first.
 * Stages (and cards) that already have data stay open.
 */

function laneFromSource(source) {
  if (source === "tag") {
    return "plate";
  }
  if (source) {
    return "name";
  }
  return "";
}

function setStageCollapsed(stage, collapsed) {
  if (!stage) {
    return;
  }
  stage.classList.toggle("is-collapsed", !!collapsed);
  var btn = stage.querySelector(".stage-toggle");
  if (btn) {
    btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
  }
}

function controlHasValue(el) {
  if (!el) {
    return false;
  }
  var type = (el.type || "").toLowerCase();
  if (type === "hidden" || type === "button" || type === "submit") {
    return false;
  }
  if (type === "checkbox" || type === "radio") {
    return !!el.checked;
  }
  return String(el.value || "").trim() !== "";
}

function stageHasData(stage) {
  if (!stage) {
    return false;
  }
  var controls = stage.querySelectorAll("input, select, textarea");
  var i;
  for (i = 0; i < controls.length; i++) {
    if (controlHasValue(controls[i])) {
      return true;
    }
  }
  return false;
}

function setCardCollapsed(card, collapsed) {
  if (!card) {
    return;
  }
  card.classList.toggle("is-collapsed", !!collapsed);
  var toggle = card.querySelector(":scope > legend .card-toggle");
  var chevron = card.querySelector(":scope > legend .card-chevron");
  if (toggle) {
    toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    toggle.setAttribute("title", collapsed ? "Expand card" : "Collapse card");
  }
  if (chevron) {
    chevron.setAttribute("aria-expanded", collapsed ? "false" : "true");
    chevron.setAttribute("aria-label", collapsed ? "Expand card" : "Collapse card");
    chevron.setAttribute("title", collapsed ? "Expand card" : "Collapse card");
  }
}

function expandFilledCards() {
  document.querySelectorAll("fieldset.card").forEach(function (card) {
    if (typeof cardHasData === "function" && cardHasData(card)) {
      setCardCollapsed(card, false);
    }
  });
}

function applyLeadLane() {
  var form = document.getElementById("leadForm");
  var source = document.getElementById("leadSource");
  if (!form) {
    return;
  }
  var lane = laneFromSource(source && source.value);
  form.classList.toggle("lane-plate", lane === "plate");
  form.classList.toggle("lane-name", lane === "name");
  form.querySelectorAll(".stage").forEach(function (stage) {
    var key = stage.getAttribute("data-stage");
    var open = key === "source";
    if (lane === "plate" && key === "vehicles") {
      open = true;
    }
    if (lane === "name" && key === "subject") {
      open = true;
    }
    if (stageHasData(stage)) {
      open = true;
    }
    setStageCollapsed(stage, !open);
  });
  expandFilledCards();
}

function bindStageToggles() {
  document.querySelectorAll(".stage-toggle").forEach(function (btn) {
    if (btn.dataset.stageBound === "true") {
      return;
    }
    btn.dataset.stageBound = "true";
    btn.addEventListener("click", function () {
      var stage = btn.closest(".stage");
      setStageCollapsed(stage, !stage.classList.contains("is-collapsed"));
    });
  });
  function bindStageAdd(btnId, addId, stageName) {
    var btn = document.getElementById(btnId);
    var add = document.getElementById(addId);
    if (!btn || !add) {
      return;
    }
    btn.addEventListener("click", function () {
      var stage = document.querySelector('.stage[data-stage="' + stageName + '"]');
      if (!stage) {
        return;
      }
      if (stage.classList.contains("is-collapsed")) {
        setStageCollapsed(stage, false);
        var first = stage.querySelector(".card-list > fieldset");
        if (first) {
          setCardCollapsed(first, false);
        }
        if (typeof stage.scrollIntoView === "function") {
          stage.scrollIntoView({ block: "start", behavior: "smooth" });
        }
        return;
      }
      add.click();
    });
  }
  bindStageAdd("stageAddVehicle", "addVehicleButton", "vehicles");
  bindStageAdd("stageAddLocation", "addLocationButton", "places");
  bindStageAdd("stageAddRelationship", "addRelationshipButton", "people");
}

function followUpItems() {
  return Array.prototype.slice.call(
    document.querySelectorAll("#followUpList .follow-up-item")
  );
}

function followUpRecords() {
  return followUpItems().map(function (el) {
    return {
      followUpId: el.getAttribute("data-id") || "",
      type: el.getAttribute("data-type") || "",
      label: el.getAttribute("data-label") || "",
      note: el.getAttribute("data-note") || "",
      status: el.getAttribute("data-status") || "open"
    };
  });
}

function setFollowUpCount() {
  var n = followUpItems().filter(function (el) {
    return el.getAttribute("data-status") !== "done";
  }).length;
  var stamp = document.getElementById("followUpCount");
  if (stamp) {
    stamp.textContent = "(" + n + ")";
  }
}

function renderFollowUp(record) {
  var item = document.createElement("div");
  item.className = "follow-up-item";
  item.setAttribute("data-id", record.followUpId || "");
  item.setAttribute("data-type", record.type || "");
  item.setAttribute("data-label", record.label || "");
  item.setAttribute("data-note", record.note || "");
  item.setAttribute("data-status", record.status || "open");
  var title = document.createElement("strong");
  title.textContent = (record.type || "item") + ": " + (record.label || "");
  var openBtn = document.createElement("button");
  openBtn.type = "button";
  openBtn.className = "action-button-secondary";
  openBtn.textContent = "Open";
  openBtn.addEventListener("click", function () {
    openFollowUp(record);
  });
  var doneBtn = document.createElement("button");
  doneBtn.type = "button";
  doneBtn.className = "action-button-secondary";
  doneBtn.textContent = record.status === "done" ? "Open again" : "Done";
  doneBtn.addEventListener("click", function () {
    var next = item.getAttribute("data-status") === "done" ? "open" : "done";
    item.setAttribute("data-status", next);
    doneBtn.textContent = next === "done" ? "Open again" : "Done";
    setFollowUpCount();
  });
  item.appendChild(title);
  item.appendChild(openBtn);
  item.appendChild(doneBtn);
  return item;
}

function paintFollowUps(records) {
  var panelList = document.getElementById("followUpList");
  var stageList = document.getElementById("followUpStageList");
  [panelList, stageList].forEach(function (list) {
    if (!list) {
      return;
    }
    list.replaceChildren();
  });
  (records || []).forEach(function (record) {
    if (panelList) {
      panelList.appendChild(renderFollowUp(record));
    }
    if (stageList) {
      stageList.appendChild(renderFollowUp(record));
    }
  });
  setFollowUpCount();
}

function addFollowUp(type) {
  var label = window.prompt("Label this " + type + " so you can find it later:");
  if (!label || !String(label).trim()) {
    return;
  }
  var records = followUpRecords();
  records.push({
    followUpId:
      window.COPDoc && COPDoc.model && COPDoc.model.newId
        ? COPDoc.model.newId("fu")
        : "fu_" + Date.now().toString(36),
    type: type,
    label: String(label).trim(),
    note: "",
    status: "open"
  });
  paintFollowUps(records);
  var panel = document.getElementById("followUpPanel");
  if (panel) {
    panel.hidden = false;
  }
}

function openFollowUp(record) {
  var type = record.type;
  if (type === "vehicle" && typeof repeatableCardAdders !== "undefined") {
    var vehicle =
      window.COPDoc && COPDoc.cards && COPDoc.cards.add
        ? COPDoc.cards.add("vehicle")
        : null;
    if (vehicle) {
      var plate = vehicle.querySelector('[data-field="licensePlate"]');
      var owner = vehicle.querySelector('[data-field="registeredOwner"]');
      if (/^[A-Za-z0-9]{2,8}$/.test(record.label) && plate) {
        plate.value = record.label.toUpperCase();
      } else if (owner) {
        owner.value = record.label;
      }
      var stage = document.querySelector('.stage[data-stage="vehicles"]');
      setStageCollapsed(stage, false);
      vehicle.scrollIntoView({ block: "start" });
    }
    return;
  }
  if (type === "location" && window.COPDoc && COPDoc.cards) {
    var loc = COPDoc.cards.add("location");
    if (loc) {
      var street = loc.querySelector('[data-field="street"]');
      if (street) {
        street.value = record.label;
      }
      setStageCollapsed(document.querySelector('.stage[data-stage="places"]'), false);
      loc.scrollIntoView({ block: "start" });
    }
    return;
  }
  if (type === "person" && window.COPDoc && COPDoc.cards) {
    var rel = COPDoc.cards.add("relationship");
    setStageCollapsed(document.querySelector('.stage[data-stage="people"]'), false);
    if (rel && typeof rel.scrollIntoView === "function") {
      rel.scrollIntoView({ block: "start" });
    }
    window.alert(
      "Stub person “" +
        record.label +
        "”. Link them when you know how they connect. The title/name on other cards is not changed."
    );
  }
}

function jumpToStage(stage) {
  if (!stage) {
    return;
  }
  setStageCollapsed(stage, false);
  if (typeof stageHasData === "function" && stageHasData(stage)) {
    expandFilledCards();
  }
  if (typeof stage.scrollIntoView === "function") {
    stage.scrollIntoView({ block: "start", behavior: "smooth" });
  }
  stage.classList.add("is-jump-target");
  window.setTimeout(function () {
    stage.classList.remove("is-jump-target");
  }, 1200);
}

var JUMP_LABELS = {
  source: "Source",
  subject: "Subject",
  people: "People",
  vehicles: "Vehicles",
  places: "Places",
  criminal: "Criminal"
};

function bindPageJump() {
  var list = document.getElementById("pageJumpList");
  if (!list) {
    return;
  }
  list.replaceChildren();
  document.querySelectorAll("#leadForm .stage").forEach(function (stage) {
    var key = stage.getAttribute("data-stage") || "";
    if (key === "followups") {
      return;
    }
    var toggle = stage.querySelector(".stage-toggle");
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "page-jump-btn";
    btn.textContent = JUMP_LABELS[key] || (toggle && toggle.textContent.trim()) || key;
    btn.addEventListener("click", function () {
      jumpToStage(stage);
    });
    list.appendChild(btn);
  });
}

function bindFollowUps() {
  bindPageJump();
}

function bindWorkflow() {
  bindStageToggles();
  bindPageJump();
  applyLeadLane();
}

window.applyLeadLane = applyLeadLane;
window.followUpRecords = followUpRecords;
window.paintFollowUps = paintFollowUps;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bindWorkflow);
} else {
  bindWorkflow();
}
