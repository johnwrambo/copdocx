/**
 * Person-name parser for lead entry.
 * Paste "Last, First Middle" or "First Middle Last" into first, middle,
 * or last and the three fields fill together.
 */

var NAME_PREFIXES = {
  mr: true,
  mrs: true,
  ms: true,
  miss: true,
  dr: true,
  prof: true,
  professor: true,
  sir: true,
  rev: true,
  hon: true,
  fr: true,
  capt: true,
  captain: true,
  lt: true,
  sgt: true,
  col: true,
  gen: true
};

var NAME_SUFFIXES = {
  jr: "Jr",
  sr: "Sr",
  ii: "II",
  iii: "III",
  iv: "IV",
  v: "V",
  "2nd": "2nd",
  "3rd": "3rd",
  "4th": "4th",
  esq: "Esq",
  phd: "PhD",
  md: "MD",
  jd: "JD",
  do: "DO",
  dds: "DDS",
  rn: "RN",
  cpa: "CPA"
};

var NAME_PARTICLE_TWO = {
  van: true,
  von: true,
  del: true,
  de: true,
  da: true,
  das: true,
  dos: true,
  di: true,
  du: true,
  la: true,
  le: true,
  st: true,
  y: true
};

function normalizeNameKey(token) {
  return String(token || "")
    .toLowerCase()
    .replace(/[.]/g, "")
    .replace(/,+$/g, "");
}

function cleanNameToken(token) {
  return String(token || "")
    .replace(/^[,]+|[,]+$/g, "")
    .trim();
}

function tokenizeName(text) {
  return String(text || "")
    .replace(/[\t\n\r]+/g, " ")
    .trim()
    .split(/\s+/)
    .map(cleanNameToken)
    .filter(Boolean);
}

function stripPrefix(tokens) {
  if (!tokens.length) {
    return { prefix: "", tokens: tokens };
  }
  if (NAME_PREFIXES[normalizeNameKey(tokens[0])]) {
    return { prefix: tokens[0], tokens: tokens.slice(1) };
  }
  return { prefix: "", tokens: tokens };
}

function stripSuffix(tokens) {
  if (!tokens.length) {
    return { suffix: "", tokens: tokens };
  }
  var last = tokens[tokens.length - 1];
  var key = normalizeNameKey(last);
  if (NAME_SUFFIXES[key]) {
    return { suffix: NAME_SUFFIXES[key], tokens: tokens.slice(0, -1) };
  }
  return { suffix: "", tokens: tokens };
}

function isNameInitial(token) {
  var key = normalizeNameKey(token);
  return key.length === 1;
}

function isParticleToken(token) {
  var key = normalizeNameKey(token);
  return (
    NAME_PARTICLE_TWO[key] === true ||
    key === "los" ||
    key === "las"
  );
}

function takeLastName(tokens) {
  var count = tokens.length;
  if (!count) {
    return { last: "", rest: [] };
  }

  var keys = tokens.map(normalizeNameKey);

  if (
    count >= 3 &&
    keys[count - 3] === "de" &&
    (keys[count - 2] === "la" ||
      keys[count - 2] === "los" ||
      keys[count - 2] === "las")
  ) {
    return {
      last: tokens.slice(-3).join(" "),
      rest: tokens.slice(0, -3)
    };
  }

  if (count >= 2 && NAME_PARTICLE_TWO[keys[count - 2]]) {
    return {
      last: tokens.slice(-2).join(" "),
      rest: tokens.slice(0, -2)
    };
  }

  if (
    count >= 3 &&
    !isNameInitial(tokens[count - 1]) &&
    !isNameInitial(tokens[count - 2]) &&
    !isParticleToken(tokens[count - 2])
  ) {
    return {
      last: tokens[count - 2] + " " + tokens[count - 1],
      rest: tokens.slice(0, -2)
    };
  }

  return {
    last: tokens[count - 1],
    rest: tokens.slice(0, -1)
  };
}

function capitalizeNameToken(token) {
  var cleaned = cleanNameToken(token);
  if (!cleaned) {
    return "";
  }

  if (cleaned.indexOf("-") !== -1) {
    return cleaned
      .split("-")
      .map(capitalizeNameToken)
      .join("-");
  }

  var key = normalizeNameKey(cleaned);
  if (isParticleToken(cleaned)) {
    return key;
  }

  if (NAME_SUFFIXES[key]) {
    return NAME_SUFFIXES[key];
  }

  if (/^o'/i.test(cleaned) && cleaned.length > 2) {
    return "O'" + capitalizeNameToken(cleaned.slice(2));
  }

  if (/^mc/i.test(cleaned) && cleaned.length > 3) {
    return "Mc" + capitalizeNameToken(cleaned.slice(2));
  }

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

function formatNamePhrase(text) {
  return tokenizeName(text).map(capitalizeNameToken).join(" ");
}

/**
 * Last-name display: FATHERSURNAME-Mothersurname.
 * One surname → ALL CAPS. Two surnames (space or hyphen) → paternal ALL
 * CAPS, hyphen, maternal Title Case. A trailing space is kept so the
 * second surname can still be typed.
 */
function hyphenateLastName(text) {
  var raw = String(text || "");
  var trailingSpace = /\s$/.test(raw);
  var lastName = raw.replace(/[\t\n\r]+/g, " ").trim();
  if (!lastName) {
    return "";
  }

  if (lastName.indexOf("-") !== -1) {
    var hyphenPosition = lastName.indexOf("-");
    var paternalHyphen = lastName.slice(0, hyphenPosition).trim().toUpperCase();
    var maternalHyphen = lastName.slice(hyphenPosition + 1).trim();
    if (!maternalHyphen) {
      return paternalHyphen + (trailingSpace ? " " : "-");
    }
    return paternalHyphen + "-" + formatNamePhrase(maternalHyphen);
  }

  var tokens = tokenizeName(lastName);
  if (!tokens.length) {
    return "";
  }

  var leadingParticles = [];
  var i = 0;
  while (i < tokens.length && isParticleToken(tokens[i])) {
    leadingParticles.push(tokens[i]);
    i += 1;
  }
  if (i >= tokens.length) {
    return lastName.toUpperCase() + (trailingSpace ? " " : "");
  }

  var paternalBits = leadingParticles.concat([tokens[i]]);
  var rest = tokens.slice(i + 1);
  if (!rest.length) {
    return paternalBits.join(" ").toUpperCase() + (trailingSpace ? " " : "");
  }
  return (
    paternalBits.join(" ").toUpperCase() +
    "-" +
    formatNamePhrase(rest.join(" "))
  );
}

function withSuffix(last, suffix) {
  if (!last) {
    return suffix || "";
  }
  if (!suffix) {
    return last;
  }
  return last + " " + suffix;
}

function parsePersonName(input, options) {
  options = options || {};
  var field = options.field || "";

  var raw = String(input || "")
    .replace(/[\t\n\r]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["']+|["']+$/g, "");

  var empty = {
    raw: raw,
    prefix: "",
    first: "",
    middle: "",
    last: "",
    suffix: "",
    lastOnly: false,
    isComplete: false
  };

  if (!raw) {
    return empty;
  }

  var commaAt = raw.indexOf(",");
  var prefix = "";
  var suffix = "";
  var first = "";
  var middle = "";
  var last = "";
  var lastOnly = false;

  if (commaAt !== -1) {
    var lastBits = stripPrefix(tokenizeName(raw.slice(0, commaAt)));
    prefix = lastBits.prefix;
    var lastCore = stripSuffix(lastBits.tokens);
    suffix = lastCore.suffix;
    last = lastCore.tokens.join(" ");

    var givenBits = stripPrefix(tokenizeName(raw.slice(commaAt + 1)));
    if (!prefix) {
      prefix = givenBits.prefix;
    }
    var givenCore = stripSuffix(givenBits.tokens);
    if (!suffix) {
      suffix = givenCore.suffix;
    }
    if (givenCore.tokens.length) {
      first = givenCore.tokens[0];
      middle = givenCore.tokens.slice(1).join(" ");
    }
  } else {
    var spaced = stripPrefix(tokenizeName(raw));
    prefix = spaced.prefix;
    var spacedCore = stripSuffix(spaced.tokens);

    suffix = spacedCore.suffix;
    var body = spacedCore.tokens;

    if (
      field === "lastName" &&
      body.length >= 2 &&
      body.length <= 3 &&
      !isNameInitial(body[0])
    ) {
      last = body.join(" ");
      lastOnly = true;
    } else if (body.length === 1) {
      if (field === "lastName") {
        last = body[0];
        lastOnly = true;
      } else if (field === "middleName") {
        middle = body[0];
      } else {
        first = body[0];
      }
    } else if (body.length >= 2) {
      var split = takeLastName(body);
      last = split.last;
      if (split.rest.length) {
        first = split.rest[0];
        middle = split.rest.slice(1).join(" ");
      }
    }
  }

  first = formatNamePhrase(first);
  middle = formatNamePhrase(middle);
  last = withSuffix(hyphenateLastName(last), suffix);

  return {
    raw: raw,
    prefix: prefix,
    first: first,
    middle: middle,
    last: last,
    suffix: suffix,
    lastOnly: lastOnly,
    isComplete: !!(first && last)
  };
}

function nameCardRoot(input) {
  if (input && input.closest) {
    return input.closest("[data-name-card]") || document;
  }
  return document;
}

function nameField(root, name) {
  return (
    root.querySelector('[data-field="' + name + '"]') ||
    (root.getElementById ? root.getElementById(name) : null)
  );
}

function applyParsedName(parsed, root) {
  root = root || document;
  var firstInput = nameField(root, "firstName");
  var middleInput = nameField(root, "middleName");
  var lastInput = nameField(root, "lastName");

  if (!firstInput || !middleInput || !lastInput || !parsed) {
    return false;
  }

  if (parsed.isComplete) {
    firstInput.value = parsed.first;
    middleInput.value = parsed.middle || "";
    lastInput.value = parsed.last;
    return true;
  }

  if (parsed.lastOnly && parsed.last) {
    lastInput.value = parsed.last;
    return true;
  }

  return false;
}

function formatNamePhraseLive(text) {
  var raw = String(text || "");
  var trailingSpace = /\s$/.test(raw);
  var formatted = formatNamePhrase(raw);
  if (!formatted) {
    return "";
  }
  return formatted + (trailingSpace ? " " : "");
}

function rewriteLiveValue(input, formatted) {
  if (!input) {
    return;
  }
  var before = String(input.value || "");
  if (formatted === before) {
    return;
  }
  var atEnd =
    input.selectionStart === before.length &&
    input.selectionEnd === before.length;
  input.value = formatted;
  if (atEnd && typeof input.setSelectionRange === "function") {
    input.setSelectionRange(formatted.length, formatted.length);
  }
}

function liveFormatNameField(input) {
  if (!input) {
    return;
  }
  var field = input.getAttribute("data-field") || input.id;
  var formatted =
    field === "lastName"
      ? hyphenateLastName(input.value)
      : formatNamePhraseLive(input.value);
  rewriteLiveValue(input, formatted);
}

function formatNameFieldValue(input) {
  if (!input || !input.value) {
    return;
  }
  var field = input.getAttribute("data-field") || input.id;
  if (field === "lastName") {
    input.value = hyphenateLastName(input.value).replace(/\s+$/, "");
    return;
  }
  input.value = formatNamePhrase(input.value);
}

function attachNamePasteParser(input, card) {
  if (!input || input.dataset.nameBound === "true") {
    return;
  }
  input.dataset.nameBound = "true";
  card = card || nameCardRoot(input);
  var field = input.getAttribute("data-field") || input.id;

  input.addEventListener("paste", function () {
    window.setTimeout(function () {
      var parsed = parsePersonName(input.value, { field: field });
      if (!applyParsedName(parsed, card)) {
        formatNameFieldValue(input);
      }
    }, 0);
  });

  // input = live format, no errors. blur = finish format (trim trailing space).
  input.addEventListener("input", function () {
    liveFormatNameField(input);
  });

  input.addEventListener("blur", function () {
    formatNameFieldValue(input);
  });
}

function bindNameCard(card) {
  if (!card) {
    return;
  }
  ["firstName", "middleName", "lastName"].forEach(function (name) {
    attachNamePasteParser(nameField(card, name), card);
  });
  if (typeof bindAgeCard === "function") {
    bindAgeCard(card);
  }
}

if (document.querySelectorAll) {
  document.querySelectorAll("[data-name-card]").forEach(bindNameCard);
}
