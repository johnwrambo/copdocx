const fs = require("fs");
const vm = require("vm");
const path = require("path");

const context = {
  document: {
    getElementById: function () {
      return null;
    }
  },
  window: { setTimeout: setTimeout },
  URL: URL
};
vm.createContext(context);
require("./support/module-dependencies.js").loadScript(context, "functions/address.js");
const parseAddress = context.window.parseAddress;
const validateAddress = context.window.validateAddress;
const formatAddressQuery = context.window.AddressUtils.formatAddressQuery;
const googleMapsSearchUrl = context.window.googleMapsSearchUrl;
const formatCoordinate = context.window.formatCoordinate;
const parseMapLink = context.window.parseMapLink;
const parseLatLong = context.window.parseLatLong;

let fail = 0;
function check(label, ok, extra) {
  if (!ok) {
    fail += 1;
    console.log("FAIL", label, extra || "");
  } else {
    console.log("ok", label);
  }
}

const parsed = parseAddress(
  "123 n main st apt 4, houston, tx 77002"
);
check(
  "parse street",
  parsed.components.street === "123 N Main St",
  parsed.components
);
check("parse unit", parsed.components.street2 === "Apt 4");
check("parse city", parsed.components.city === "Houston");
check("parse state", parsed.components.state === "TX");
check("parse zip", parsed.components.zip === "77002");
check("parse complete", parsed.isComplete === true);

const texas = parseAddress("500 Travis Street, Houston, Texas 77002-1234");
check("state name", texas.components.state === "TX");
check("zip+4", texas.components.zip === "77002-1234");

const empty = validateAddress({
  street: "",
  street2: "",
  city: "",
  state: "",
  zip: ""
});
check("empty is valid", empty.valid === true && empty.complete === false);

const good = validateAddress({
  street: "123 main st",
  street2: "",
  city: "houston",
  state: "texas",
  zip: "77002"
});
check("good address", good.valid && good.complete);
check("norm street", good.normalized.street === "123 Main St");
check("norm city", good.normalized.city === "Houston");
check("norm state", good.normalized.state === "TX");

const badZip = validateAddress({
  street: "123 Main St",
  city: "Houston",
  state: "TX",
  zip: "77"
});
check(
  "bad zip",
  !badZip.valid &&
    badZip.errors.some(function (e) {
      return e.field === "zip";
    })
);

const badState = validateAddress({
  street: "123 Main St",
  city: "Houston",
  state: "ZZ",
  zip: "77002"
});
check(
  "bad state",
  !badState.valid &&
    badState.errors.some(function (e) {
      return e.field === "state";
    })
);

const poBox = validateAddress({
  street: "po box 441",
  city: "Laredo",
  state: "TX",
  zip: "78040"
});
check("po box", poBox.valid && poBox.normalized.street === "PO Box 441");

const query = formatAddressQuery({
  street: "123 Main St",
  street2: "Apt 4",
  city: "Houston",
  state: "TX",
  zip: "77002"
});
check(
  "maps query",
  query === "123 Main St, Apt 4, Houston, TX, 77002",
  query
);
check(
  "maps url",
  googleMapsSearchUrl(query).indexOf("google.com/maps/search") !== -1
);
check("coord format", formatCoordinate(-95.36981234) === "-95.369812");

const googlePlace = parseMapLink(
  "https://www.google.com/maps/place/Foo/@29.7604,-95.3698,17z/data=!3d29.760427!4d-95.369803"
);
check("google place url", googlePlace.url.indexOf("google.com/maps/place") !== -1);
check(
  "google pin coords beat camera",
  googlePlace.latitude === "29.760427" && googlePlace.longitude === "-95.369803",
  googlePlace
);

const googleAt = parseMapLink("https://www.google.com/maps/@29.7604,-95.3698,17z");
check(
  "google @ camera",
  googleAt.latitude === "29.7604" && googleAt.longitude === "-95.3698"
);

const googleQuery = parseMapLink(
  "https://www.google.com/maps/search/?api=1&query=29.7604,-95.3698"
);
check(
  "google query coords",
  googleQuery.latitude === "29.7604" && googleQuery.longitude === "-95.3698"
);

const apple = parseMapLink("https://maps.apple.com/?ll=29.7604,-95.3698&q=Houston");
check(
  "apple ll",
  apple.latitude === "29.7604" && apple.longitude === "-95.3698"
);

const osm = parseMapLink("https://www.openstreetmap.org/#map=17/29.7604/-95.3698");
check(
  "osm hash",
  osm.latitude === "29.7604" && osm.longitude === "-95.3698"
);

const waze = parseMapLink("https://waze.com/ul?ll=29.7604,-95.3698&navigate=yes");
check(
  "waze ll",
  waze.latitude === "29.7604" && waze.longitude === "-95.3698"
);

const shortLink = parseMapLink("maps.app.goo.gl/abc123");
check(
  "short link protocol",
  shortLink.url.indexOf("https://maps.app.goo.gl/abc123") === 0 && !shortLink.error,
  shortLink
);
check("short link no coords", shortLink.latitude === "" && shortLink.longitude === "");

const wrapped = parseMapLink(
  "check this https://maps.apple.com/?ll=29.76,-95.37 thanks."
);
check(
  "extract url from extra text",
  wrapped.url.indexOf("maps.apple.com") !== -1 &&
    wrapped.latitude === "29.76" &&
    wrapped.longitude === "-95.37"
);

const pastedPair = parseLatLong(
  "32.74458235328899, -97.81617603781437"
);
check(
  "paste lat long pair",
  pastedPair.latitude === "32.74458235328899" &&
    pastedPair.longitude === "-97.81617603781437",
  pastedPair
);

const spacedPair = parseLatLong("32.74458235328899  -97.81617603781437");
check(
  "space separated pair",
  spacedPair.latitude === "32.74458235328899" &&
    spacedPair.longitude === "-97.81617603781437"
);

const swapped = parseLatLong("-97.816176, 32.744582");
check(
  "lng lat swap when first is longitude",
  swapped.latitude === "32.744582" && swapped.longitude === "-97.816176",
  swapped
);

const nsewPair = parseLatLong("32.744582 N, 97.816176 W");
check(
  "nsew pair",
  nsewPair.latitude === "32.744582" && nsewPair.longitude === "-97.816176",
  nsewPair
);

const labeled = parseLatLong("lat: 32.744582, lng: -97.816176");
check(
  "labeled pair",
  labeled.latitude === "32.744582" && labeled.longitude === "-97.816176",
  labeled
);

const singleLat = parseLatLong("32.74458235328899", { as: "latitude" });
check(
  "single lat stays in field",
  singleLat.value === "32.74458235328899" &&
    !singleLat.latitude &&
    !singleLat.longitude
);

const badLat = parseLatLong("97.8", { as: "latitude" });
check("lat out of range", !!badLat.error);

const validateLatLong = context.window.validateLatLong;
const formatLatLongPair = context.window.formatLatLongPair;
check("pair display", formatLatLongPair("32.74", "-97.81") === "32.74, -97.81");
check("empty lat long allowed", validateLatLong("").valid === true && !validateLatLong("").complete);
const goodPair = validateLatLong("32.744582, -97.816176");
check(
  "valid pair",
  goodPair.valid === true &&
    goodPair.complete === true &&
    goodPair.formatted === "32.744582, -97.816176"
);
check("single number incomplete", validateLatLong("32.744582").valid === false);
check("zero zero rejected", validateLatLong("0, 0").valid === false);
check("lat too big", validateLatLong("99.1, -97.8").valid === false);
check("lng too big", validateLatLong("32.7, -200").valid === false);
check(
  "swapped pair accepted",
  validateLatLong("-97.816176, 32.744582").valid === true &&
    validateLatLong("-97.816176, 32.744582").latitude === "32.744582"
);

const notALink = parseMapLink("123 Main St Houston TX");
check("street is not a map link", !!notALink.error && !notALink.url);

check(
  "bindAddressCard exported",
  typeof context.window.bindAddressCard === "function"
);

if (fail) {
  process.exit(1);
}
console.log("all passed");
