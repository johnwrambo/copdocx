/**
 * US phone format + validate.
 * Display: 214-555-0100. Empty is allowed. Format on input; 10-digit
 * check on blur. A leading 1 is stripped.
 */

function phoneDigits(value) {
  var digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.charAt(0) === "1") {
    digits = digits.slice(1);
  }
  return digits.slice(0, 10);
}

function formatPhone(value) {
  var digits = phoneDigits(value);
  if (!digits) {
    return "";
  }
  if (digits.length <= 3) {
    return digits;
  }
  if (digits.length <= 6) {
    return digits.slice(0, 3) + "-" + digits.slice(3);
  }
  return digits.slice(0, 3) + "-" + digits.slice(3, 6) + "-" + digits.slice(6);
}

function validatePhone(value) {
  var digits = phoneDigits(value);
  var formatted = formatPhone(digits);
  if (!digits) {
    return {
      digits: "",
      formatted: "",
      complete: false,
      valid: true,
      reason: ""
    };
  }
  if (digits.length < 10) {
    return {
      digits: digits,
      formatted: formatted,
      complete: false,
      valid: false,
      reason: "Phone needs 10 digits"
    };
  }
  return {
    digits: digits,
    formatted: formatted,
    complete: true,
    valid: true,
    reason: ""
  };
}

function bindPhoneInput(input, status) {
  if (!input || input.dataset.phoneBound === "true") {
    return;
  }
  input.dataset.phoneBound = "true";

  function paintLive() {
    var formatted = formatPhone(input.value);
    if (formatted !== input.value) {
      var atEnd =
        input.selectionStart === input.value.length &&
        input.selectionEnd === input.value.length;
      input.value = formatted;
      if (atEnd && typeof input.setSelectionRange === "function") {
        input.setSelectionRange(formatted.length, formatted.length);
      }
    }
    if (status && !status.classList.contains("is-ok")) {
      status.hidden = true;
      status.textContent = "";
    }
    input.classList.remove("is-invalid");
    input.classList.remove("invalid-field");
  }

  function paintBlur() {
    var result = validatePhone(input.value);
    input.value = result.formatted;
    if (!result.valid) {
      input.classList.add("is-invalid");
      input.classList.add("invalid-field");
      if (status) {
        status.hidden = false;
        status.textContent = result.reason;
        status.classList.remove("is-ok");
      }
      return result;
    }
    input.classList.remove("is-invalid");
    input.classList.remove("invalid-field");
    if (status) {
      status.hidden = true;
      status.textContent = "";
    }
    return result;
  }

  input.addEventListener("input", paintLive);
  input.addEventListener("blur", paintBlur);
}

if (document.querySelectorAll) {
  document.querySelectorAll('input[type="tel"]').forEach(function (input) {
    var status = input.parentNode
      ? input.parentNode.querySelector(".field-status")
      : null;
    bindPhoneInput(input, status);
  });
}
