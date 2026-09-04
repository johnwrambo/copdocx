var fs = require("fs");
var path = require("path");
var vm = require("vm");
var assert = require("assert");

function el(tag) {
  return {
    tagName: String(tag).toUpperCase(),
    children: [],
    hidden: false,
    className: "",
    textContent: "",
    src: "",
    alt: "",
    href: "",
    target: "",
    listeners: {},
    appendChild: function (child) {
      this.children.push(child);
      return child;
    },
    addEventListener: function (type, fn) {
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type].push(fn);
    }
  };
}

var opened = [];
var context = {
  window: {},
  document: { createElement: el },
  location: { href: "map.html" },
  screen: { availWidth: 1600, availHeight: 900 },
  open: function (url, name, features) {
    var win = {
      url: url,
      name: name,
      features: features,
      focused: false,
      resized: null,
      moved: null
    };
    win.location = {
      href: url,
      replace: function (next) {
        win.url = next;
        win.location.href = next;
      }
    };
    win.focus = function () {
      win.focused = true;
    };
    win.resizeTo = function (width, height) {
      win.resized = [width, height];
    };
    win.moveTo = function (left, top) {
      win.moved = [left, top];
    };
    opened.push(win);
    return win;
  },
  URL: {
    createObjectURL: function () {
      return "blob:test";
    },
    revokeObjectURL: function () {}
  }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "..", "functions/map-popup.js"), "utf8"),
  context
);

var api = context.COPDoc.mapPopup;
assert.ok(api && typeof api.card === "function", "mapPopup.card");

var card = api.card({
  title: "House",
  extra: "Residence",
  address: "1 Main St",
  isPrimary: true
});
assert.equal(card.className, "case-map-popup");
assert.equal(card._photoBox.hidden, true);
assert.equal(card.children[1].children[0].textContent, "House · Primary");
assert.equal(card._photoImg.className, "case-map-popup-photo-main");
assert.equal(card._personPhotoImg.className, "case-map-popup-photo-person");

var withPhoto = api.card({
  title: "Car",
  photoDataUrl: "data:image/png;base64,xx"
});
assert.equal(withPhoto._photoBox.hidden, false);
assert.equal(withPhoto._photoImg.src, "data:image/png;base64,xx");
assert.equal(withPhoto._photoLoaded, true);

var withBoth = api.card({
  title: "Target house",
  objectPhotoDataUrl: "data:image/png;base64,house",
  personPhotoDataUrl: "data:image/png;base64,person"
});
assert.equal(withBoth._photoBox.hidden, false);
assert.equal(withBoth._photoImg.src, "data:image/png;base64,house");
assert.equal(withBoth._personPhotoImg.src, "data:image/png;base64,person");
assert.equal(withBoth._personPhotoImg.hidden, false);
assert.ok(/has-person-photo/.test(withBoth._photoBox.className));

var bag = ["blob:old"];
api.revoke(bag);
assert.equal(bag.length, 1);

var withoutCase = api.card({ title: "Officer home" });
assert.equal(
  withoutCase.children[1].children.some(function (child) {
    return child.className === "case-map-popup-actions";
  }),
  false
);

var withCase = api.card({
  title: "DIAZ, ANA",
  extra: "Residence",
  address: "1 Main St",
  caseUrl: "case.html?id=lead1",
  caseWindowName: "copdoc-case-lead1",
  caseLabel: "Open case"
});
var actions = withCase.children[1].children.filter(function (child) {
  return child.className === "case-map-popup-actions";
})[0];
assert.ok(actions, "case link actions");
var caseLink = actions.children[0];
assert.equal(caseLink.tagName, "A");
assert.equal(caseLink.className, "case-map-popup-case-link");
assert.equal(caseLink.href, "case.html?id=lead1");
assert.equal(caseLink.target, "copdoc-case-lead1");
assert.equal(caseLink.textContent, "Open case");
caseLink.listeners.click[0]({
  defaultPrevented: false,
  button: 0,
  preventDefault: function () {},
  stopPropagation: function () {}
});
assert.equal(opened.length, 1);
assert.equal(opened[0].url, "case.html?id=lead1");
assert.equal(opened[0].name, "copdoc-case-lead1");
assert.ok(/popup=yes/.test(opened[0].features));
assert.ok(/popup=true/.test(opened[0].features));
assert.ok(/width=672/.test(opened[0].features));
assert.ok(opened[0].resized[0] < 1000);
assert.equal(opened[0].focused, true);

var defaultCase = api.card({
  title: "Subject",
  caseUrl: "case.html?id=lead3"
});
var defaultActions = defaultCase.children[1].children.filter(function (child) {
  return child.className === "case-map-popup-actions";
})[0];
assert.equal(defaultActions.children[0].target, "copdoc-case-view");
defaultActions.children[0].listeners.click[0]({
  defaultPrevented: false,
  button: 0,
  preventDefault: function () {},
  stopPropagation: function () {}
});
assert.equal(opened[1].name, "copdoc-case-view");
assert.equal(opened[1].url, "case.html?id=lead3");

assert.equal(typeof api.openCasePopup, "function");
api.openCasePopup("case.html?id=lead2", "copdoc-case-view");
assert.equal(opened[2].url, "case.html?id=lead2");
assert.equal(opened[2].name, "copdoc-case-view");
assert.ok(/popup=yes/.test(opened[2].features));

console.log("test-map-popup: ok");
