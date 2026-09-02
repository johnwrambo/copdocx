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
    appendChild: function (child) {
      this.children.push(child);
      return child;
    }
  };
}

var context = {
  window: {},
  document: { createElement: el },
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

var withPhoto = api.card({
  title: "Car",
  photoDataUrl: "data:image/png;base64,xx"
});
assert.equal(withPhoto._photoBox.hidden, false);
assert.equal(withPhoto._photoImg.src, "data:image/png;base64,xx");
assert.equal(withPhoto._photoLoaded, true);

var bag = ["blob:old"];
api.revoke(bag);
assert.equal(bag.length, 1);

console.log("test-map-popup: ok");
