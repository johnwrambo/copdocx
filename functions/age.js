/**
 * Age from a date-of-birth field.
 * Shows "Age: XX" beside the DOB label; under 18 also shows "minor" in red.
 */

function parseIsoDate(value) {
  var match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }
  var year = Number(match[1]);
  var month = Number(match[2]) - 1;
  var day = Number(match[3]);
  var date = new Date(year, month, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function calculateAge(dateOfBirth, asOf) {
  var dob = dateOfBirth instanceof Date ? dateOfBirth : parseIsoDate(dateOfBirth);
  if (!dob) {
    return null;
  }
  var today = asOf instanceof Date ? asOf : new Date();
  var age = today.getFullYear() - dob.getFullYear();
  var monthDelta = today.getMonth() - dob.getMonth();
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

function updateAgeDisplay(card) {
  if (!card) {
    return;
  }
  var dobInput = card.querySelector('[data-field="dateOfBirth"]');
  var display = card.querySelector('[data-field="ageDisplay"]');
  if (!display) {
    return;
  }

  var age = dobInput ? calculateAge(dobInput.value) : null;
  display.textContent = "";
  if (age === null) {
    return;
  }

  display.appendChild(document.createTextNode("Age: " + age));
  if (isMinor(age)) {
    var minor = document.createElement("span");
    minor.className = "age-minor";
    minor.textContent = "minor";
    display.appendChild(minor);
  }
}

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
