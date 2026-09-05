"use strict";

const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..", "..");

const MODEL_SCRIPTS = Object.freeze([
  "functions/model/util.js",
  "functions/model/lead.js",
  "functions/model/person.js",
  "functions/model/encounter.js",
  "functions/model/location.js",
  "functions/model/vehicle.js",
  "functions/model/link.js",
  "functions/model/store.js"
]);

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function toStoredValue(value) {
  return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * An isolated localStorage double with deterministic write failures.
 * No browser storage or filesystem state is read or written by this harness.
 */
function createMemoryStorage(initial) {
  const memory = {};
  Object.keys(initial || {}).forEach((key) => {
    memory[key] = toStoredValue(initial[key]);
  });

  let writeCount = 0;
  let failure = null;
  const history = [];

  function failureMatches(key, number) {
    if (!failure) {
      return false;
    }
    if (failure.key && failure.key !== key) {
      return false;
    }
    if (failure.writeNumber && failure.writeNumber !== number) {
      return false;
    }
    return true;
  }

  const storage = {
    getItem(key) {
      return own(memory, key) ? memory[key] : null;
    },
    setItem(key, value) {
      writeCount += 1;
      const record = {
        operation: "setItem",
        key: String(key),
        writeNumber: writeCount,
        failed: false
      };
      history.push(record);
      if (failureMatches(String(key), writeCount)) {
        record.failed = true;
        if (failure.once !== false) {
          failure = null;
        }
        throw new Error("Injected localStorage write failure for " + key + ".");
      }
      memory[String(key)] = String(value);
    },
    removeItem(key) {
      history.push({ operation: "removeItem", key: String(key), failed: false });
      delete memory[String(key)];
    },
    clear() {
      history.push({ operation: "clear", key: "*", failed: false });
      Object.keys(memory).forEach((key) => delete memory[key]);
    },
    key(index) {
      return Object.keys(memory)[index] || null;
    }
  };

  Object.defineProperty(storage, "length", {
    get() {
      return Object.keys(memory).length;
    }
  });

  return {
    storage,
    failNext(key) {
      failure = { key: key ? String(key) : "", once: true };
    },
    failOnWrite(writeNumber, key) {
      failure = {
        key: key ? String(key) : "",
        writeNumber: Number(writeNumber),
        once: true
      };
    },
    clearFailure() {
      failure = null;
    },
    resetWriteHistory() {
      writeCount = 0;
      history.length = 0;
    },
    writeCount() {
      return writeCount;
    },
    history() {
      return history.map((row) => Object.assign({}, row));
    },
    raw(key) {
      return own(memory, key) ? memory[key] : null;
    },
    json(key, fallback) {
      const raw = own(memory, key) ? memory[key] : "";
      return raw ? JSON.parse(raw) : fallback;
    },
    setRaw(key, value) {
      memory[String(key)] = toStoredValue(value);
    },
    dump() {
      return Object.assign({}, memory);
    }
  };
}

function createMinimalDocument(page) {
  const listeners = {};
  const body = {
    dataset: {},
    getAttribute(name) {
      return name === "data-page" ? page || "" : null;
    }
  };
  return {
    readyState: "loading",
    body,
    documentElement: { dataset: {} },
    getElementById() {
      return null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    createElement(tagName) {
      return {
        tagName: String(tagName || "div").toUpperCase(),
        dataset: {},
        classList: { add() {}, remove() {}, toggle() {} },
        children: [],
        appendChild(child) {
          this.children.push(child);
          return child;
        },
        append() {},
        addEventListener() {},
        querySelector() { return null; },
        querySelectorAll() { return []; }
      };
    },
    createTextNode(value) {
      return { textContent: String(value == null ? "" : value) };
    },
    addEventListener(type, listener) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(listener);
    },
    removeEventListener(type, listener) {
      listeners[type] = (listeners[type] || []).filter((fn) => fn !== listener);
    },
    _dispatch(type, event) {
      (listeners[type] || []).slice().forEach((listener) => listener(event || {}));
    }
  };
}

function quietConsole() {
  return {
    log() {},
    info() {},
    warn() {},
    error() {}
  };
}

function createTab(storageControl, options) {
  options = options || {};
  const listeners = {};
  const location = Object.assign(
    { href: "http://copdoc.test/", search: "", pathname: "/" },
    options.location || {}
  );
  const context = {
    window: {},
    localStorage: storageControl.storage,
    sessionStorage: createMemoryStorage().storage,
    console: options.console || console,
    Date,
    JSON,
    Array,
    Object,
    Math,
    Promise,
    URL,
    URLSearchParams,
    Blob: typeof Blob === "undefined" ? function BlobStub() {} : Blob,
    FileReader: function FileReaderStub() {},
    Event: function EventStub(type, init) {
      this.type = type;
      this.bubbles = !!(init && init.bubbles);
    },
    atob(value) {
      return Buffer.from(String(value), "base64").toString("binary");
    },
    btoa(value) {
      return Buffer.from(String(value), "binary").toString("base64");
    },
    setTimeout,
    clearTimeout,
    location,
    navigator: {},
    document: options.document,
    confirm: options.confirm || (() => true),
    alert: options.alert || (() => {}),
    prompt: options.prompt || (() => "")
  };
  context.globalThis = context;
  context.window = context;
  context.addEventListener = function addEventListener(type, listener) {
    listeners[type] = listeners[type] || [];
    listeners[type].push(listener);
  };
  context.removeEventListener = function removeEventListener(type, listener) {
    listeners[type] = (listeners[type] || []).filter((fn) => fn !== listener);
  };
  context._dispatchWindowEvent = function dispatchWindowEvent(type, event) {
    (listeners[type] || []).slice().forEach((listener) => listener(event || {}));
  };
  vm.createContext(context);
  return context;
}

const { loadScript } = require("./module-dependencies.js");

function run(context, source) {
  return vm.runInContext(source, context);
}

function loadModelTab(storageControl, options) {
  options = options || {};
  const context = createTab(storageControl, options);
  (options.scripts || MODEL_SCRIPTS).forEach((script) => loadScript(context, script));
  return {
    context,
    model: context.COPDoc.model,
    storage: storageControl
  };
}

module.exports = {
  ROOT,
  MODEL_SCRIPTS,
  createMemoryStorage,
  createMinimalDocument,
  quietConsole,
  createTab,
  loadScript,
  loadModelTab,
  run
};
