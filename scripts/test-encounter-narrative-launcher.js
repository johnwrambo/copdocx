"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var source = fs.readFileSync(
  path.join(__dirname, "..", "functions", "narratives", "encounter-launcher.js"),
  "utf8"
);

function createElement(id, value) {
  return {
    id: id,
    value: value || "",
    href: "",
    dataset: {},
    listeners: {},
    addEventListener: function (type, listener) {
      this.listeners[type] = listener;
    }
  };
}

function boot(saveOnRequest) {
  var encounterId = "DAL-E-2026-3-0001";
  var field = createElement("encounterId", encounterId);
  var link = createElement("openEncounterNarrativesButton");
  var tab = createElement("tabbtn-narrative");
  var form = createElement("encounterForm");
  var elements = {
    encounterId: field,
    openEncounterNarrativesButton: link,
    "tabbtn-narrative": tab,
    encounterForm: form
  };
  var requested = 0;
  var loaded = 0;
  var status = "";
  var persisted = false;
  var timers = [];
  var windowObject;
  var app = {
    model: {
      autosave: {
        bind: function (options) {
          assert.equal(options.key, "encounter-form");
          return {
            request: function () {
              requested += 1;
              windowObject.setTimeout(function () {
                persisted = !!saveOnRequest;
              });
            }
          };
        }
      },
      store: {
        loadFromDisk: function () {
          loaded += 1;
        },
        getEncounter: function (id) {
          return persisted && id === encounterId ? { encounterId: id } : null;
        }
      }
    },
    setAppBarStatus: function (message) {
      status = message;
    }
  };
  windowObject = {
    COPDoc: app,
    location: {
      search: "?id=" + encodeURIComponent(encounterId),
      href: "encounter-form.html?id=" + encodeURIComponent(encounterId)
    },
    addEventListener: function () {},
    setTimeout: function (listener) {
      timers.push(listener);
    }
  };
  vm.runInNewContext(source, {
    COPDoc: app,
    URLSearchParams: URLSearchParams,
    document: {
      readyState: "complete",
      getElementById: function (id) {
        return elements[id] || null;
      }
    },
    globalThis: windowObject,
    window: windowObject
  });
  return {
    encounterId: encounterId,
    link: link,
    tab: tab,
    window: windowObject,
    requested: function () {
      return requested;
    },
    loaded: function () {
      return loaded;
    },
    status: function () {
      return status;
    },
    pendingTimers: function () {
      return timers.length;
    },
    runNextTimer: function () {
      var listener = timers.shift();
      if (listener) {
        listener();
      }
    }
  };
}

var live = boot(true);
assert.equal(
  live.link.href,
  "narrative.html?encounterId=" + encodeURIComponent(live.encounterId)
);
assert.equal(typeof live.tab.listeners.click, "function");
var prevented = false;
var stopped = false;
live.tab.listeners.click({
  preventDefault: function () {
    prevented = true;
  },
  stopPropagation: function () {
    stopped = true;
  }
});
assert.equal(prevented, true, "the tab must not open its intermediate panel");
assert.equal(stopped, true, "the tab event must not reach the Encounter tab handler");
assert.equal(live.requested(), 1, "the Encounter autosave should flush first");
assert.equal(live.pendingTimers(), 2, "save must be queued before navigation");
assert.match(live.window.location.href, /^encounter-form\.html/);
live.runNextTimer();
assert.equal(live.loaded(), 0, "navigation must wait for the save timer");
assert.match(live.window.location.href, /^encounter-form\.html/);
live.runNextTimer();
assert.equal(live.loaded(), 1, "the launcher should verify persisted Encounter data");
assert.equal(
  live.window.location.href,
  "narrative.html?encounterId=" + encodeURIComponent(live.encounterId)
);

var missing = boot(false);
missing.tab.listeners.click({ preventDefault: function () {}, stopPropagation: function () {} });
missing.runNextTimer();
missing.runNextTimer();
assert.match(missing.status(), /Enter at least one encounter detail/);
assert.match(missing.window.location.href, /^encounter-form\.html/);

console.log("ok Encounter Narrative tab launches the live workspace directly");
