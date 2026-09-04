const assert = require("assert");
const crypto = require("crypto").webcrypto;
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function classList() {
  const values = new Set();
  return {
    add(value) { values.add(value); },
    remove(value) { values.delete(value); },
    contains(value) { return values.has(value); },
    toggle(value, force) {
      if (force) values.add(value);
      else values.delete(value);
    }
  };
}

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Buffer.from(digest).toString("hex");
}

(async function () {
  const lockKey = "copdocx.privacy-lock.v1";
  const sessionKey = "copdocx.privacy-unlocked.v1";
  const salt = "00112233445566778899aabbccddeeff";
  const phrase = "test phrase";
  const hash = await sha256(`${salt}\u0000${phrase}`);
  const local = new Map([[lockKey, JSON.stringify({
    schema: lockKey,
    algorithm: "SHA-256",
    salt,
    hash
  })]]);
  const session = new Map();
  const status = { textContent: "", hidden: true, classList: classList() };
  const input = {
    value: "wrong phrase",
    selected: false,
    focus() {},
    select() { this.selected = true; }
  };
  let submit;
  const form = {
    elements: { phrase: input },
    addEventListener(type, handler) {
      if (type === "submit") submit = handler;
    }
  };
  const screen = {
    className: "",
    hidden: false,
    innerHTML: "",
    querySelector(selector) {
      if (selector === "[data-lock-form]") return form;
      if (selector === "[data-lock-status]") return status;
      if (selector === "input") return input;
      return null;
    }
  };
  const rootClasses = classList();
  const context = {
    crypto,
    TextEncoder,
    Uint8Array,
    CustomEvent: function CustomEvent(type) { this.type = type; },
    localStorage: {
      getItem(key) { return local.has(key) ? local.get(key) : null; },
      setItem(key, value) { local.set(key, value); }
    },
    sessionStorage: {
      getItem(key) { return session.has(key) ? session.get(key) : null; },
      setItem(key, value) { session.set(key, value); },
      removeItem(key) { session.delete(key); }
    },
    document: {
      body: { appendChild() {} },
      documentElement: { classList: rootClasses },
      readyState: "complete",
      createElement() { return screen; }
    },
    dispatchEvent() {}
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "..", "functions", "privacy-gate.js"), "utf8"),
    context
  );

  assert.strictEqual(typeof submit, "function", "unlock handler should mount");
  assert.strictEqual(rootClasses.contains("copdoc-locked"), true);

  const wrongEvent = { preventDefault() {}, currentTarget: form };
  submit(wrongEvent);
  wrongEvent.currentTarget = null;
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.strictEqual(rootClasses.contains("copdoc-locked"), true);
  assert.strictEqual(status.textContent, "That phrase did not match.");
  assert.strictEqual(input.selected, true);

  input.value = phrase;
  const rightEvent = { preventDefault() {}, currentTarget: form };
  submit(rightEvent);
  rightEvent.currentTarget = null;
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.strictEqual(rootClasses.contains("copdoc-locked"), false);
  assert.strictEqual(screen.hidden, true);
  assert.strictEqual(session.get(sessionKey), hash);

  console.log("ok privacy gate");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
