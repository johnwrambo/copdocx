"use strict";

var assert = require("assert").strict;
var rapSheet = require("../functions/rapsheet.js");

function FakeElement(tagName, ownerDocument) {
  this.tagName = String(tagName || "div").toUpperCase();
  this.ownerDocument = ownerDocument;
  this.children = [];
  this.parentNode = null;
  this.attributes = {};
  this.listeners = {};
  this.className = "";
  this.id = "";
  this.value = "";
  this.type = "";
  this.hidden = false;
  this.checked = false;
  this.selected = false;
  this._textContent = "";
}

Object.defineProperty(FakeElement.prototype, "firstChild", {
  get: function () {
    return this.children.length ? this.children[0] : null;
  }
});

Object.defineProperty(FakeElement.prototype, "textContent", {
  get: function () {
    return (
      this._textContent +
      this.children.map(function (child) {
        return child.textContent;
      }).join("")
    );
  },
  set: function (value) {
    this._textContent = String(value == null ? "" : value);
    this.children = [];
  }
});

FakeElement.prototype.appendChild = function (child) {
  child.parentNode = this;
  this.children.push(child);
  if (this.tagName === "SELECT" && child.tagName === "OPTION") {
    if (child.selected || this.children.length === 1) {
      this.value = child.value;
    }
  }
  return child;
};

FakeElement.prototype.removeChild = function (child) {
  var index = this.children.indexOf(child);
  if (index !== -1) {
    this.children.splice(index, 1);
    child.parentNode = null;
  }
  return child;
};

FakeElement.prototype.setAttribute = function (name, value) {
  this.attributes[name] = String(value);
};

FakeElement.prototype.getAttribute = function (name) {
  return Object.prototype.hasOwnProperty.call(this.attributes, name)
    ? this.attributes[name]
    : null;
};

FakeElement.prototype.addEventListener = function (type, listener) {
  this.listeners[type] = this.listeners[type] || [];
  this.listeners[type].push(listener);
};

FakeElement.prototype.dispatchEvent = function (event) {
  var listeners = this.listeners[event.type] || [];
  listeners.forEach(function (listener) {
    listener.call(this, event);
  }, this);
  return true;
};

FakeElement.prototype.dispatch = function (type) {
  this.dispatchEvent({
    type: type,
    preventDefault: function () {},
    stopPropagation: function () {}
  });
};

function matchesSelector(element, selector) {
  if (selector.charAt(0) === ".") {
    var className = selector.slice(1);
    return String(element.className || "").split(/\s+/).indexOf(className) !== -1;
  }
  var attributeMatch = selector.match(/^\[([^\]]+)\]$/);
  if (attributeMatch) {
    return element.getAttribute(attributeMatch[1]) != null;
  }
  return element.tagName.toLowerCase() === selector.toLowerCase();
}

FakeElement.prototype.querySelectorAll = function (selector) {
  var found = [];
  function visit(element) {
    element.children.forEach(function (child) {
      if (matchesSelector(child, selector)) {
        found.push(child);
      }
      visit(child);
    });
  }
  visit(this);
  return found;
};

FakeElement.prototype.querySelector = function (selector) {
  var matches = this.querySelectorAll(selector);
  return matches.length ? matches[0] : null;
};

function FakeDocument() {
  this.body = new FakeElement("body", this);
}

FakeDocument.prototype.createElement = function (tagName) {
  return new FakeElement(tagName, this);
};

FakeDocument.prototype.getElementById = function (id) {
  var found = null;
  function visit(element) {
    if (found) {
      return;
    }
    if (element.id === id) {
      found = element;
      return;
    }
    element.children.forEach(visit);
  }
  visit(this.body);
  return found;
};

FakeDocument.prototype.createEvent = function () {
  return {
    type: "",
    detail: null,
    initCustomEvent: function (type, bubbles, cancelable, detail) {
      this.type = type;
      this.detail = detail;
    }
  };
};

function addElement(doc, tagName, id) {
  var element = doc.createElement(tagName);
  element.id = id;
  doc.body.appendChild(element);
  return element;
}

var doc = new FakeDocument();
var textarea = addElement(doc, "textarea", "rapSheet");
var parseButton = addElement(doc, "button", "rapSheetParseButton");
var discardButton = addElement(doc, "button", "rapSheetDiscardButton");
var statusElement = addElement(doc, "span", "rapSheetImportStatus");
var reviewElement = addElement(doc, "section", "rapSheetReview");
var importIdElement = addElement(doc, "input", "rapSheetImportId");

var criminalCheckbox = addElement(doc, "input", "isCriminal");
var fbiInput = addElement(doc, "input", "fbiNumber");
var ncicInput = addElement(doc, "input", "ncicNumber");
var crimeInput = addElement(doc, "input", "crime");
var convictionDateInput = addElement(doc, "input", "convictionDate");

criminalCheckbox.checked = false;
fbiInput.value = "KEEP-FBI";
ncicInput.value = "KEEP-NCIC";
crimeInput.value = "KEEP-CRIME";
convictionDateInput.value = "1999-01-01";

var idCounter = 0;
var controller = rapSheet.attachRapSheetImport(textarea, {
  parseButton: parseButton,
  discardButton: discardButton,
  statusElement: statusElement,
  reviewElement: reviewElement,
  importIdElement: importIdElement,
  now: "2026-08-25T12:00:00Z",
  reviewerId: "test-reviewer",
  idFactory: function (prefix) {
    idCounter += 1;
    return prefix + "-dom-" + idCounter;
  }
});

textarea.value = [
  "TEXAS CRIMINAL HISTORY",
  "NAM/<img src=x onerror=global.__rapDomExecuted=true>",
  "ARREST CYCLE 1",
  "ARREST CHARGE: THEFT",
  "DISPOSITION: CONVICTED 01/02/2020",
  "<script>global.__rapDomExecuted=true</script>"
].join("\n");
global.__rapDomExecuted = false;
parseButton.dispatch("click");

var parsed = controller.getImport();
assert.ok(parsed);
assert.equal(global.__rapDomExecuted, false);
assert.equal(reviewElement.hidden, false);
assert.match(reviewElement.textContent, /<img src=x onerror=/);
assert.match(reviewElement.textContent, /<script>global\.__rapDomExecuted/);
assert.equal(reviewElement.querySelectorAll("script").length, 0);
assert.equal(reviewElement.querySelectorAll("img").length, 0);
assert.equal(criminalCheckbox.checked, false);
assert.equal(fbiInput.value, "KEEP-FBI");
assert.equal(ncicInput.value, "KEEP-NCIC");
assert.equal(crimeInput.value, "KEEP-CRIME");
assert.equal(convictionDateInput.value, "1999-01-01");

var dispositionDate = parsed.cycles[0].dispositions[0].date;
reviewElement.querySelectorAll("[data-rap-status-for]").forEach(function (select) {
  select.value = "accepted";
});
reviewElement.querySelectorAll("[data-rap-unparsed-status-for]").forEach(function (select) {
  select.value = "accepted";
});
reviewElement.querySelectorAll("[data-rap-value-for]").forEach(function (input) {
  if (input.getAttribute("data-rap-value-for") === dispositionDate.factId) {
    input.value = "02/03/2025";
  }
});
reviewElement.querySelector(".rap-review-save").dispatch("click");

assert.equal(parsed.reviewStatus, "reviewed");
assert.equal(dispositionDate.correctedValue, "02/03/2025");
assert.equal(dispositionDate.normalizedValue, "2025-02-03");
assert.equal(dispositionDate.originalNormalizedValue, "2020-01-02");
assert.equal(parsed.summary.mostRecentConviction, "2025-02-03");
assert.equal(parsed.auditTrail[1].reviewer.id, "test-reviewer");
assert.ok(parsed.auditTrail[1].factChanges.length > 0);
assert.ok(parsed.auditTrail[1].unparsedSectionChanges.length > 0);

var originalSource = textarea.value;
textarea.value += "\nNEW SOURCE LINE";
textarea.dispatch("input");
assert.equal(parsed.reviewStatus, "stale");
assert.match(reviewElement.textContent, /STALE \/ REPARSE REQUIRED/);
assert.equal(reviewElement.querySelector(".rap-review-save"), null);

textarea.value = originalSource;
textarea.dispatch("input");
assert.equal(parsed.reviewStatus, "reviewed");
assert.ok(reviewElement.querySelector(".rap-review-save"));

discardButton.dispatch("click");
assert.equal(controller.getImport(), null);
assert.equal(textarea.value, originalSource);
assert.equal(reviewElement.hidden, true);

textarea.value = "COMPLETELY UNKNOWN BLOCK";
parseButton.dispatch("click");
var unparsedOnly = controller.getImport();
assert.equal(unparsedOnly.reviewStatus, "pending");
assert.equal(reviewElement.querySelector(".rap-review-save"), null);
assert.equal(
  reviewElement.querySelectorAll("[data-rap-unparsed-status-for]").length,
  0
);

assert.equal(criminalCheckbox.checked, false);
assert.equal(fbiInput.value, "KEEP-FBI");
assert.equal(ncicInput.value, "KEEP-NCIC");
assert.equal(crimeInput.value, "KEEP-CRIME");
assert.equal(convictionDateInput.value, "1999-01-01");
delete global.__rapDomExecuted;

process.stdout.write("RAP-sheet DOM integration tests passed.\n");
