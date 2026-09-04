"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");

function el(extras) {
  return Object.assign(
    {
      value: "",
      hidden: false,
      disabled: false,
      textContent: "",
      innerHTML: "",
      innerText: "",
      children: [],
      style: {},
      dataset: {},
      classList: { toggle: function () {} },
      querySelector: function () {
        return null;
      },
      querySelectorAll: function () {
        return [];
      },
      addEventListener: function () {},
      focus: function () {},
      setAttribute: function () {},
      appendChild: function (child) {
        this.children.push(child);
        return child;
      },
      remove: function () {
        this.removed = true;
      }
    },
    extras || {}
  );
}

var narrative = el({
  tagName: "P",
  textContent: "ICE Dallas arrested Ana GARCIA."
});
var heading = el({
  tagName: "P",
  textContent: "INTERNAL Background Required for Privacy Review:"
});
var bullet = el({
  tagName: "LI",
  textContent: "No foreign warrants."
});
var editor = el({
  id: "baseballCardEditor",
  querySelector: function (sel) {
    if (sel === ".narrative-cell p" || sel === "p") {
      return narrative;
    }
    return null;
  },
  querySelectorAll: function (sel) {
    if (sel === "p") {
      return [narrative, heading];
    }
    if (sel === "li") {
      return [bullet];
    }
    return [];
  }
});
var status = el({ id: "baseballCardStatus" });
var foreignWarrants = el({ id: "foreignWarrants", value: "no" });
var ids = {
  baseballCardEditor: editor,
  baseballCardStatus: status,
  foreignWarrants: foreignWarrants,
  foreignWarrantCountry: el({ id: "foreignWarrantCountry", value: "" })
};
var holders = [];
var copiedHtml = "";
var clipboardWrites = [];
var body = el({
  appendChild: function (child) {
    this.children.push(child);
    return child;
  }
});

var documentStub = {
  body: body,
  readyState: "complete",
  getElementById: function (id) {
    return ids[id] || null;
  },
  querySelector: function () {
    return null;
  },
  querySelectorAll: function () {
    return [];
  },
  createElement: function () {
    var node = el();
    holders.push(node);
    return node;
  },
  createRange: function () {
    return {
      selectNodeContents: function () {}
    };
  },
  execCommand: function (command) {
    var holder = holders[holders.length - 1];
    copiedHtml = holder && holder.innerHTML ? String(holder.innerHTML) : "";
    return command === "copy" && copiedHtml.indexOf("<table") !== -1;
  },
  addEventListener: function () {}
};

var context = {
  window: {},
  document: documentStub,
  console: console,
  Blob: Blob,
  navigator: {
    clipboard: {
      write: function (items) {
        clipboardWrites.push(items);
        return Promise.resolve();
      },
      writeText: function () {
        throw new Error("writeText should not be the email copy path");
      }
    }
  },
  ClipboardItem: function (items) {
    this.items = items;
  },
  isSecureContext: true,
  getSelection: function () {
    return {
      removeAllRanges: function () {},
      addRange: function () {}
    };
  },
  COPDoc: { model: null, media: null, setAppBarStatus: function () {} },
  formatAlienNumber: function (value) {
    return "A" + String(value || "");
  },
  sessionStorage: {
    getItem: function () {
      return null;
    },
    setItem: function () {},
    removeItem: function () {}
  }
};
context.window = context;
context.globalThis = context;
documentStub.body.getAttribute = function () {
  return "";
};

vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "..", "functions", "baseballcard.js"), "utf8"),
  context
);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "..", "functions", "baseball-page.js"), "utf8"),
  context
);

function check(label, ok, extra) {
  if (!ok) {
    console.log("FAIL", label, extra || "");
    process.exitCode = 1;
  } else {
    console.log("ok", label);
  }
}

context.copyBaseballCard().then(function () {
  check(
    "copy writes an arrest-card table, not raw editor text",
    copiedHtml.indexOf("<table") !== -1 &&
      copiedHtml.indexOf("Dallas") !== -1 &&
      copiedHtml.indexOf("ICE Dallas arrested Ana GARCIA.") !== -1 &&
      copiedHtml.indexOf("<ul") !== -1,
    copiedHtml.slice(0, 220)
  );
  check(
    "copy does not fall back to writeText",
    clipboardWrites.length === 0
  );
  check(
    "status reports formatted copy",
    /copied with its formatting/i.test(status.textContent)
  );
  if (process.exitCode) {
    process.exit(1);
  }
  console.log("all passed");
}).catch(function (error) {
  console.error(error);
  process.exit(1);
});
