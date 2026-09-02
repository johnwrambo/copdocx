/**
 * Alien number display: A000 000 000
 * Digits only underneath (up to 9). Shared by Lead Entry baseball card
 * and Book-in so the same input is not formatted two different ways.
 */

function alienNumberDigits(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 9);
}

function formatAlienNumberGroups(value) {
  var digits = alienNumberDigits(value);
  if (!digits) {
    return "";
  }
  var groups = [digits.slice(0, 3)];
  if (digits.length > 3) {
    groups.push(digits.slice(3, 6));
  }
  if (digits.length > 6) {
    groups.push(digits.slice(6, 9));
  }
  return groups.join(" ");
}

function formatAlienNumber(value) {
  var groups = formatAlienNumberGroups(value);
  return groups ? "A" + groups : "";
}

function bindAlienNumberInput(input) {
  if (!input || input.dataset.alienNumberBound === "true") {
    return;
  }
  input.dataset.alienNumberBound = "true";

  function paint() {
    var digits = alienNumberDigits(input.value);
    input.value = formatAlienNumber(digits);
    input.classList.toggle(
      "invalid-field",
      digits.length > 0 && digits.length !== 9
    );
    return digits;
  }

  input.addEventListener("input", paint);
  input.addEventListener("blur", paint);
}

if (document.getElementById) {
  bindAlienNumberInput(document.getElementById("alienNumber"));
}
