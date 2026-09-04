/**
 * Age from Date of Birth.
 *
 * Two pieces on the lead card:
 *   #age        hidden input — the number only (39)
 *   #ageDisplay span         — "Age: 39" plus "minor" in red if under 18
 *
 * Flow: DOB changes → calculateAge → write #age → paint #ageDisplay
 * from that stored number. Never parse the span text to get the age.
 */

/** "YYYY-MM-DD" from <input type="date"> → local Date, or null if junk. */
function parseIsoDate(value) {
  var match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }
  var year = Number(match[1]);
  var month = Number(match[2]) - 1; // Date months are 0–11
  var day = Number(match[3]);
  var date = new Date(year, month, day);
  // Reject impossible dates (Feb 31 becomes Mar 3, so the parts won't match).
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

/** Cross-realm Date check (tests and embedded views may have another global). */
function isDateValue(value) {
  return (
    Object.prototype.toString.call(value) === "[object Date]" &&
    typeof value.getTime === "function" &&
    Number.isFinite(value.getTime())
  );
}

/**
 * Whole years old as of `asOf` (defaults to today).
 * Returns null if DOB is missing, invalid, or in the future.
 */
function calculateAge(dateOfBirth, asOf) {
  var dob = isDateValue(dateOfBirth) ? dateOfBirth : parseIsoDate(dateOfBirth);
  if (!dob) {
    return null;
  }
  var today = typeof asOf === "undefined" ? new Date() : asOf;
  if (!isDateValue(today)) {
    return null;
  }
  var age = today.getFullYear() - dob.getFullYear();
  var monthDelta = today.getMonth() - dob.getMonth();
  // Birthday has not happened yet this year → still last year's age.
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  if (age < 0) {
    return null;
  }
  return age;
}

function isMinor(age) {
  return typeof age === "number" && age < 18;
}

/**
 * Recalc from DOB, store the number on #age, then build the visible label
 * from that stored number. Pass a card, or omit to use the Lead Information card.
 */
function updateAgeDisplay(card) {
  card = card || document.querySelector('[data-card="lead"]');
  if (!card) {
    return;
  }
  var dobInput = card.querySelector('[data-field="dateOfBirth"]');
  var ageInput = card.querySelector('[data-field="age"]') ||
    document.getElementById("age");
  var display = card.querySelector('[data-field="ageDisplay"]') ||
    document.getElementById("ageDisplay");

  var age = dobInput ? calculateAge(dobInput.value) : null;

  // 1. Store the standalone number (or blank if no valid DOB).
  if (ageInput) {
    ageInput.value = age === null ? "" : String(age);
  }
  if (!display) {
    return;
  }

  // 2. Paint the label from the stored number, not from `age` directly.
  display.textContent = "";
  var stored = ageInput ? ageInput.value : "";
  if (stored === "") {
    return;
  }

  display.appendChild(document.createTextNode("Age: " + stored));
  if (isMinor(Number(stored))) {
    var minor = document.createElement("span");
    minor.className = "age-minor";
    minor.textContent = "minor";
    display.appendChild(minor);
  }
}

/** Wire DOB input/change → updateAgeDisplay. Runs once per card. */
function bindAgeCard(card) {
  if (!card || card.dataset.ageBound === "true") {
    return;
  }
  card.dataset.ageBound = "true";
  var dobInput = card.querySelector('[data-field="dateOfBirth"]');
  if (!dobInput) {
    return;
  }
  dobInput.addEventListener("change", function () {
    updateAgeDisplay(card);
  });
  dobInput.addEventListener("input", function () {
    updateAgeDisplay(card);
  });
  updateAgeDisplay(card);
}
