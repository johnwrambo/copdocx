/**
 * Social Security Number format + validate.
 *
 * Display: AAA-GG-SSSS (123-45-6789). Digits only under the hyphens.
 * Empty is allowed. Partial values format as you type; 9-digit SSA
 * rules run on blur.
 *
 *   #ssn        the input
 *   #ssnStatus  short reason under the field (hidden when ok / empty)
 */

var KNOWN_INVALID_SSNS = {
  "078051120": true, // Woolworth wallet sample
  "219099999": true, // SSA advertising sample
  "123456789": true // sequential placeholder
};

function ssnDigits(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 9);
}

/** 123 → 123-45 → 123-45-6789 as digits arrive. */
function formatSSN(value) {
  var digits = ssnDigits(value);
  if (!digits) {
    return "";
  }
  if (digits.length <= 3) {
    return digits;
  }
  if (digits.length <= 5) {
    return digits.slice(0, 3) + "-" + digits.slice(3);
  }
  return (
    digits.slice(0, 3) +
    "-" +
    digits.slice(3, 5) +
    "-" +
    digits.slice(5)
  );
}

function isITIN(digits) {
  if (!/^\d{9}$/.test(digits) || digits.charAt(0) !== "9") {
    return false;
  }
  var group = Number(digits.slice(3, 5));
  var serial = digits.slice(5, 9);
  if (serial === "0000") {
    return false;
  }
  return (
    (group >= 70 && group <= 88) ||
    (group >= 90 && group <= 92) ||
    (group >= 94 && group <= 99)
  );
}

/**
 * { digits, formatted, complete, valid, kind, reason }
 * kind: "" | "SSN" | "ITIN"
 * valid: empty counts as valid (field is not required).
 */
function validateSSN(value) {
  var digits = ssnDigits(value);
  var formatted = formatSSN(digits);
  var blank = {
    digits: "",
    formatted: "",
    complete: false,
    valid: true,
    kind: "",
    reason: ""
  };
  if (!digits) {
    return blank;
  }
  if (digits.length < 9) {
    return {
      digits: digits,
      formatted: formatted,
      complete: false,
      valid: false,
      kind: "",
      reason: "SSN needs 9 digits"
    };
  }

  var area = digits.slice(0, 3);
  var group = digits.slice(3, 5);
  var serial = digits.slice(5, 9);

  if (KNOWN_INVALID_SSNS[digits]) {
    return {
      digits: digits,
      formatted: formatted,
      complete: true,
      valid: false,
      kind: "",
      reason: "Known invalid sample SSN"
    };
  }
  if (/^(\d)\1{8}$/.test(digits)) {
    return {
      digits: digits,
      formatted: formatted,
      complete: true,
      valid: false,
      kind: "",
      reason: "Repeating digits are not a valid SSN"
    };
  }
  if (isITIN(digits)) {
    return {
      digits: digits,
      formatted: formatted,
      complete: true,
      valid: true,
      kind: "ITIN",
      reason: "ITIN (not an SSN)"
    };
  }
  if (area === "000" || area === "666" || area.charAt(0) === "9") {
    return {
      digits: digits,
      formatted: formatted,
      complete: true,
      valid: false,
      kind: "",
      reason: "Invalid area number"
    };
  }
  if (group === "00") {
    return {
      digits: digits,
      formatted: formatted,
      complete: true,
      valid: false,
      kind: "",
      reason: "Invalid group number"
    };
  }
  if (serial === "0000") {
    return {
      digits: digits,
      formatted: formatted,
      complete: true,
      valid: false,
      kind: "",
      reason: "Invalid serial number"
    };
  }

  return {
    digits: digits,
    formatted: formatted,
    complete: true,
    valid: true,
    kind: "SSN",
    reason: ""
  };
}

function applySSNToInput(input, options) {
  options = options || {};
  if (!input) {
    return validateSSN("");
  }
  var start = input.selectionStart;
  var before = String(input.value || "");
  var digitsBeforeCursor = before.slice(0, start).replace(/\D/g, "").length;
  var result = validateSSN(before);
  var next = result.formatted;
  if (next !== before) {
    input.value = next;
    if (typeof input.setSelectionRange === "function") {
      var i = 0;
      var seen = 0;
      while (i < next.length && seen < digitsBeforeCursor) {
        if (/\d/.test(next.charAt(i))) {
          seen += 1;
        }
        i += 1;
      }
      input.setSelectionRange(i, i);
    }
  }
  paintSSNStatus(input, result, options.showStatus === true);
  return result;
}

function paintSSNStatus(input, result, showStatus) {
  if (!input) {
    return;
  }
  var wrap = input.closest ? input.closest(".field") : input.parentNode;
  var status =
    (wrap && wrap.querySelector(".ssn-status")) ||
    (input.id && document.getElementById(input.id + "Status")) ||
    document.getElementById("ssnStatus");
  var invalid = showStatus && result && !result.valid;
  input.classList.toggle("is-invalid", invalid);
  if (input.setAttribute) {
    input.setAttribute("aria-invalid", invalid ? "true" : "false");
  }
  if (!status) {
    return;
  }
  if (!showStatus || !result || !result.reason) {
    status.hidden = true;
    status.textContent = "";
    status.classList.remove("is-ok");
    return;
  }
  status.hidden = false;
  status.textContent = result.reason;
  status.classList.toggle("is-ok", result.valid && result.kind === "ITIN");
}

function bindSSNInput(input) {
  if (!input || input.dataset.ssnBound === "true") {
    return;
  }
  input.dataset.ssnBound = "true";
  input.addEventListener("input", function () {
    applySSNToInput(input, { showStatus: false });
  });
  input.addEventListener("blur", function () {
    applySSNToInput(input, { showStatus: true });
  });
  if (input.value) {
    applySSNToInput(input, { showStatus: true });
  }
}

if (typeof document !== "undefined" && document.getElementById) {
  bindSSNInput(document.getElementById("ssn"));
}
