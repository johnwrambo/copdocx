"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");

function input(value, tagName) {
  return {
    value: value || "",
    tagName: tagName || "INPUT",
    options: [],
    selectedIndex: -1,
    addEventListener: function () {}
  };
}

var elements = {
  firstName: input("ANA"),
  lastName: input("GARCIA"),
  age: input("41"),
  country: input("MEXICO"),
  alienNumber: input("123456789"),
  finalOrderDate: input(""),
  firstDeportationDate: input(""),
  lastDeportationDate: input(""),
  disposition: input("REINSTATEMENT"),
  arrestDate: input("2026-09-03"),
  foreignWarrants: input("no", "SELECT"),
  foreignWarrantCountry: input(""),
  criminalHistoryList: {
    querySelectorAll: function () { return []; },
    addEventListener: function () {}
  },
  addCriminalHistory: { addEventListener: function () {} },
  baseballCardEditor: {
    innerHTML: "",
    style: {
      props: {},
      setProperty: function (name, value) {
        this.props[name] = value;
      }
    },
    replaceChildren: function () {},
    addEventListener: function () {},
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; }
  }
};

var documentStub = {
  readyState: "complete",
  getElementById: function (id) {
    return elements[id] || null;
  },
  querySelector: function () {
    return null;
  },
  querySelectorAll: function () {
    return [];
  },
  createElement: function () {
    return {
      className: "",
      textContent: "",
      children: [],
      appendChild: function (child) {
        this.children.push(child);
      }
    };
  },
  addEventListener: function () {}
};
var memory = {};
var context = {
  window: {},
  document: documentStub,
  console: console,
  localStorage: {
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
    },
    setItem: function (key, value) {
      memory[key] = String(value);
    },
    removeItem: function (key) {
      delete memory[key];
    }
  },
  formatAlienNumber: function (value) {
    return "A" + String(value || "");
  }
};
context.globalThis = context;
context.window = context;
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(
    path.join(__dirname, "..", "functions", "baseballcard.js"),
    "utf8"
  ),
  context
);

var fail = 0;
function check(label, ok, extra) {
  if (!ok) {
    fail += 1;
    console.log("FAIL", label, extra || "");
  } else {
    console.log("ok", label);
  }
}

var noWarrant = context.createBaseballText();
check(
  "no-warrant bullet uses exact requested text",
  noWarrant.indexOf("• No foreign warrants.") !== -1,
  noWarrant
);
check(
  "foreign-warrant bullet precedes photo bullet",
  noWarrant.indexOf("• No foreign warrants.") <
    noWarrant.indexOf("• photo from arrest in the field."),
  noWarrant
);
elements.foreignWarrants.value = "yes";
elements.foreignWarrantCountry.value = "MEXICO";
var yesWarrant = context.createBaseballText();
check(
  "yes-warrant bullet includes country",
  yesWarrant.indexOf("• Foreign warrants: Yes — Mexico.") !== -1,
  yesWarrant
);

var emailHtml = context.buildBaseballCardEmailMarkup(
  {
    narrative: "ICE Dallas arrested Ana GARCIA.",
    heading: "INTERNAL Background Required for Privacy Review:",
    bullets: ["No foreign warrants.", "photo from arrest in the field."]
  },
  "data:image/jpeg;base64,xx"
);
check(
  "email markup is an arrest-card table",
  emailHtml.indexOf("<table") !== -1 &&
    emailHtml.indexOf("Dallas") !== -1 &&
    emailHtml.indexOf("ICE Dallas arrested Ana GARCIA.") !== -1 &&
    emailHtml.indexOf("<li") !== -1 &&
    emailHtml.indexOf("text/html") === -1,
  emailHtml.slice(0, 180)
);
check(
  "email markup inlines photo for paste",
  emailHtml.indexOf('src="data:image/jpeg;base64,xx"') !== -1
);
var emailPlain = context.buildBaseballCardPlainText({
  narrative: "ICE Dallas arrested Ana GARCIA.",
  heading: "INTERNAL Background Required for Privacy Review:",
  bullets: ["No foreign warrants."]
});
check(
  "email plain text keeps card sections",
  emailPlain.indexOf("Dallas") === 0 &&
    emailPlain.indexOf("• No foreign warrants.") !== -1
);
var envelope = context.clipboardHtmlEnvelope(emailHtml);
check(
  "clipboard envelope marks an email fragment",
  envelope.indexOf("<!--StartFragment-->") !== -1 &&
    envelope.indexOf("<table") !== -1 &&
    envelope.indexOf("<!--EndFragment-->") !== -1
);
check(
  "editor generates the arrest-card table",
  String(elements.baseballCardEditor.innerHTML).indexOf('class="arrest-card"') !== -1 &&
    String(elements.baseballCardEditor.innerHTML).indexOf("city-row") !== -1 &&
    String(elements.baseballCardEditor.innerHTML).indexOf("narrative-cell") !== -1,
  elements.baseballCardEditor.innerHTML.slice(0, 220)
);
check(
  "factory card width is 1050",
  context.BASEBALL_CARD_STYLE_DEFAULTS.cardWidth === 1050
);
var savedStyle = context.saveBaseballCardStyle({
  cardWidth: 900,
  lineWidth: 3,
  lineColor: "#2244aa",
  fontFamily: "Georgia, serif",
  bodySize: 18
});
check("save default style ok", savedStyle.ok && savedStyle.style.cardWidth === 900);
check(
  "saved default reloads",
  context.loadBaseballCardStyle().fontFamily === "Georgia, serif" &&
    context.loadBaseballCardStyle().lineWidth === 3 &&
    context.loadBaseballCardStyle().lineColor === "#2244aa"
);
context.applyBaseballCardStyle(savedStyle.style);
check(
  "applied style sets CSS variables",
  elements.baseballCardEditor.style.props["--bb-card-width"] === "900px" &&
    elements.baseballCardEditor.style.props["--bb-line-width"] === "3px" &&
    elements.baseballCardEditor.style.props["--bb-line-color"] === "#2244aa"
);
var styledEmail = context.buildBaseballCardEmailMarkup(
  {
    narrative: "ICE Dallas arrested Ana GARCIA.",
    heading: "INTERNAL Background Required for Privacy Review:",
    bullets: ["No foreign warrants."]
  },
  "data:image/jpeg;base64,xx"
);
check(
  "email markup uses saved box and line",
  styledEmail.indexOf("max-width:900px") !== -1 &&
    styledEmail.indexOf("3px solid #2244aa") !== -1 &&
    styledEmail.indexOf("Georgia, serif") !== -1
);

if (fail) {
  process.exit(1);
}
console.log("all passed");
