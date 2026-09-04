/**
 * Local shoulder-surf lock. This hides the UI; it does not encrypt workspace data.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var config = root.config;
  var LOCK_KEY =
    (config && config.storageKey("privacyLock")) || "copdocx.privacy-lock.v1";
  var SESSION_KEY =
    (config && config.storageKey("privacySession")) ||
    "copdocx.privacy-unlocked.v1";
  var screen = null;

  function lockRecord() {
    try {
      var raw = global.localStorage.getItem(LOCK_KEY);
      if (!raw) {
        return { state: "missing", value: null };
      }
      var value = JSON.parse(raw);
      if (
        !value ||
        value.schema !== LOCK_KEY ||
        !String(value.salt || "") ||
        !/^[a-f0-9]{64}$/i.test(String(value.hash || ""))
      ) {
        return { state: "invalid", value: null };
      }
      return { state: "valid", value: value };
    } catch (error) {
      return { state: "invalid", value: null };
    }
  }

  function sessionMatches(record) {
    if (!record) {
      return false;
    }
    try {
      return global.sessionStorage.getItem(SESSION_KEY) === record.hash;
    } catch (error) {
      return false;
    }
  }

  function hex(bytes) {
    return Array.prototype.map.call(bytes, function (value) {
      return value.toString(16).padStart(2, "0");
    }).join("");
  }

  function digest(phrase, salt) {
    if (
      !global.crypto ||
      !global.crypto.subtle ||
      typeof global.TextEncoder !== "function"
    ) {
      return Promise.reject(new Error("This browser cannot verify an unlock phrase."));
    }
    var bytes = new global.TextEncoder().encode(String(salt) + "\u0000" + String(phrase));
    return global.crypto.subtle.digest("SHA-256", bytes).then(function (buffer) {
      return hex(new Uint8Array(buffer));
    });
  }

  function randomSalt() {
    if (!global.crypto || typeof global.crypto.getRandomValues !== "function") {
      return "";
    }
    var bytes = new Uint8Array(16);
    global.crypto.getRandomValues(bytes);
    return hex(bytes);
  }

  function setMessage(message, ok) {
    var el = screen && screen.querySelector("[data-lock-status]");
    if (!el) {
      return;
    }
    el.textContent = message || "";
    el.hidden = !message;
    el.classList.toggle("is-ok", !!ok);
  }

  function reveal(record) {
    try {
      global.sessionStorage.setItem(SESSION_KEY, record.hash);
    } catch (error) {}
    document.documentElement.classList.remove("copdoc-locked");
    if (screen) {
      screen.hidden = true;
    }
    global.dispatchEvent(new CustomEvent("copdoc:unlocked"));
  }

  function setupForm() {
    screen.innerHTML =
      '<main class="privacy-lock-card" aria-labelledby="privacyLockTitle">' +
      '<p class="privacy-lock-product">COPDoc</p>' +
      '<h1 id="privacyLockTitle">Set an unlock phrase</h1>' +
      '<p>This screen lock hides the workspace from casual viewing. It does not encrypt records stored in this browser.</p>' +
      '<form data-lock-form>' +
      '<label for="privacyNewPhrase">Unlock phrase</label>' +
      '<input id="privacyNewPhrase" name="phrase" type="password" autocomplete="new-password" minlength="4" required>' +
      '<label for="privacyConfirmPhrase">Confirm phrase</label>' +
      '<input id="privacyConfirmPhrase" name="confirm" type="password" autocomplete="new-password" minlength="4" required>' +
      '<p class="privacy-lock-status" data-lock-status role="status" aria-live="polite" hidden></p>' +
      '<button type="submit" class="action-button">Set phrase and unlock</button>' +
      '</form></main>';
    screen.querySelector("[data-lock-form]").addEventListener("submit", function (event) {
      event.preventDefault();
      var phrase = event.currentTarget.elements.phrase.value;
      var confirm = event.currentTarget.elements.confirm.value;
      if (phrase.length < 4) {
        setMessage("Use at least four characters.");
        return;
      }
      if (phrase !== confirm) {
        setMessage("The phrases do not match.");
        return;
      }
      var salt = randomSalt();
      if (!salt) {
        setMessage("This browser cannot create the local lock.");
        return;
      }
      setMessage("Setting the phrase…");
      digest(phrase, salt).then(function (hash) {
        var record = {
          schema: LOCK_KEY,
          algorithm: "SHA-256",
          salt: salt,
          hash: hash,
          createdAt: new Date().toISOString()
        };
        try {
          global.localStorage.setItem(LOCK_KEY, JSON.stringify(record));
        } catch (error) {
          setMessage("The phrase could not be stored. The workspace remains locked.");
          return;
        }
        reveal(record);
      }).catch(function (error) {
        setMessage(error.message || "The local lock could not be created.");
      });
    });
    screen.querySelector("input").focus();
  }

  function unlockForm(record) {
    screen.innerHTML =
      '<main class="privacy-lock-card" aria-labelledby="privacyLockTitle">' +
      '<p class="privacy-lock-product">COPDoc</p>' +
      '<h1 id="privacyLockTitle">Unlock workspace</h1>' +
      '<p>Enter the local phrase for this browser.</p>' +
      '<form data-lock-form>' +
      '<label for="privacyPhrase">Unlock phrase</label>' +
      '<input id="privacyPhrase" name="phrase" type="password" autocomplete="current-password" required>' +
      '<p class="privacy-lock-status" data-lock-status role="status" aria-live="polite" hidden></p>' +
      '<button type="submit" class="action-button">Unlock</button>' +
      '</form>' +
      '<p class="privacy-lock-note">This is a screen lock only; stored records are not encrypted.</p>' +
      '</main>';
    screen.querySelector("[data-lock-form]").addEventListener("submit", function (event) {
      event.preventDefault();
      var form = event.currentTarget;
      var phrase = form.elements.phrase.value;
      setMessage("Checking…");
      digest(phrase, record.salt).then(function (hash) {
        if (hash !== record.hash) {
          form.elements.phrase.select();
          setMessage("That phrase did not match.");
          return;
        }
        reveal(record);
      }).catch(function (error) {
        setMessage(error.message || "The phrase could not be checked.");
      });
    });
    screen.querySelector("input").focus();
  }

  function mount() {
    if (!document.body) {
      return;
    }
    if (!screen) {
      screen = document.createElement("div");
      screen.className = "privacy-lock-screen";
      document.body.appendChild(screen);
    }
    screen.hidden = false;
    var found = lockRecord();
    if (found.state === "missing") {
      setupForm();
      return;
    }
    if (found.state === "invalid") {
      screen.innerHTML =
        '<main class="privacy-lock-card" aria-labelledby="privacyLockTitle">' +
        '<p class="privacy-lock-product">COPDoc</p>' +
        '<h1 id="privacyLockTitle">Workspace locked</h1>' +
        '<p>The local lock settings could not be read. The workspace was not opened.</p>' +
        '<p class="privacy-lock-note">Clear this site\'s stored data to initialize a new empty workspace.</p>' +
        '</main>';
      return;
    }
    unlockForm(found.value);
  }

  function lock() {
    try {
      global.sessionStorage.removeItem(SESSION_KEY);
    } catch (error) {}
    document.documentElement.classList.add("copdoc-locked");
    mount();
  }

  root.privacyGate = {
    lock: lock,
    lockKey: LOCK_KEY,
    sessionKey: SESSION_KEY
  };

  var initial = lockRecord();
  if (initial.state === "valid" && sessionMatches(initial.value)) {
    document.documentElement.classList.remove("copdoc-locked");
    return;
  }
  document.documentElement.classList.add("copdoc-locked");
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
})(typeof window !== "undefined" ? window : globalThis);
