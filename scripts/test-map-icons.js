"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var storage = Object.create(null);
var context = {
  window: {},
  console: console,
  localStorage: {
    getItem: function (key) {
      return own(storage, key) ? storage[key] : null;
    },
    setItem: function (key, value) {
      storage[key] = String(value);
    }
  }
};
context.globalThis = context;
context.window = context;
vm.createContext(context);
require("./support/module-dependencies.js").loadScript(context, "assets/icons/copdoc-icons.js");

var icons = context.COPDoc && context.COPDoc.icons;
var mapIcons = context.COPDoc && context.COPDoc.mapIcons;
var fail = 0;

function check(label, ok, extra) {
  if (!ok) {
    fail += 1;
    console.log("FAIL", label, extra || "");
  } else {
    console.log("ok", label);
  }
}

function has(text, fragment) {
  return String(text || "").indexOf(fragment) !== -1;
}

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

check("general icon API loads", !!icons && typeof icons.html === "function");
check(
  "semantic map catalog is exposed",
  !!mapIcons && icons && icons.map === mapIcons
);

var entries = mapIcons && Array.isArray(mapIcons.entries) ? mapIcons.entries : [];
var ids = entries.map(function (entry) {
  return entry && entry.id;
});
var normalizedIds = ids.map(function (id) {
  return String(id || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
});

check("semantic catalog has 26 entries", entries.length === 26, entries.length);
check(
  "semantic catalog publishes all names",
  mapIcons &&
    Array.isArray(mapIcons.names) &&
    mapIcons.names.length === entries.length &&
    mapIcons.names.every(function (id, index) {
      return id === ids[index];
    })
);
check(
  "semantic IDs are present and unique",
  ids.every(Boolean) && new Set(ids).size === entries.length,
  ids.join(", ")
);
check(
  "semantic IDs remain unique after lookup normalization",
  normalizedIds.every(Boolean) &&
    new Set(normalizedIds).size === entries.length,
  normalizedIds.join(", ")
);

var libraries =
  mapIcons && Array.isArray(mapIcons.libraries) ? mapIcons.libraries : [];
var libraryIds = libraries.map(function (library) {
  return library && library.id;
});
check(
  "four selectable icon libraries are exposed",
  libraries.length === 4 && new Set(libraryIds).size === 4,
  libraryIds.join(", ")
);
check(
  "Field Ops is the backward-compatible default",
  mapIcons.getLibraryId() === "standard"
);

libraries.forEach(function (library) {
  var themedEntries = mapIcons.entriesFor(library.id);
  check(
    library.label + " resolves all semantic entries",
    themedEntries.length === entries.length &&
      themedEntries.every(function (entry) {
        return (
          entry &&
          own(icons.ICONS, entry.glyph) &&
          /^(circle|diamond|wedge|square|pin)$/.test(entry.shape)
        );
      })
  );
  check(
    library.label + " renders an allowlisted library class",
    has(
      mapIcons.badgeHtml("Target", { libraryId: library.id }),
      "is-library-" + library.id
    )
  );
  var officerHome = mapIcons.entry("OfficerHome", library.id);
  var residence = mapIcons.entry("Residence", library.id);
  var medevac = mapIcons.entry("Medevac", library.id);
  var hospital = mapIcons.entry("Hospital", library.id);
  check(
    library.label + " keeps lookalike operational roles distinct",
    officerHome.glyph + "|" + officerHome.shape !==
      residence.glyph + "|" + residence.shape &&
      medevac.glyph + "|" + medevac.shape !==
        hospital.glyph + "|" + hospital.shape
  );
});

var themeCss = fs.readFileSync(
  path.join(__dirname, "..", "style/style.css"),
  "utf8"
);
check(
  "map symbols paint fill and line instead of a circular plate",
  /\.copdoc-map-symbol\s*>\s*\.od-icon\s*\{[^}]*fill:\s*var\(--map-symbol-fill\)/s.test(
    themeCss
  ) &&
    /\.copdoc-map-symbol\s*>\s*\.od-icon\s*\{[^}]*stroke:\s*var\(--map-symbol-line\)/s.test(
      themeCss
    )
);

var activeEntriesReference = mapIcons.entries;
var standardTargetSvg = mapIcons.html("Target", 16);
var tacticalTargetSvg = mapIcons.html("Target", 16, {
  libraryId: "tactical"
});
check(
  "explicit preview library changes glyph without changing active choice",
  standardTargetSvg !== tacticalTargetSvg &&
    mapIcons.getLibraryId() === "standard"
);

storage["copdocx.map.icons.v1"] = JSON.stringify({
  category: { targets: "Target" },
  pins: { "targets:one": "Hazard" }
});
mapIcons.setLibrary("tactical", { notify: false });
var storedLibraryPrefs = JSON.parse(storage["copdocx.map.icons.v1"]);
check(
  "library switching preserves category and per-pin preferences",
  storedLibraryPrefs.libraryId === "tactical" &&
    storedLibraryPrefs.category.targets === "Target" &&
    storedLibraryPrefs.pins["targets:one"] === "Hazard"
);
check(
  "active entries update in place for existing consumers",
  mapIcons.entries === activeEntriesReference &&
    mapIcons.entry("Target").glyph === "Focus" &&
    has(mapIcons.badgeHtml("Target"), "is-library-tactical")
);
mapIcons.setTheme("cartographic", { persist: false, notify: false });
check(
  "theme aliases select their matching library",
  mapIcons.getTheme() === "atlas"
);
mapIcons.setLibrary("__proto__", { persist: false, notify: false });
check(
  "unsafe library IDs fall back to Field Ops",
  mapIcons.getLibraryId() === "standard" &&
    has(mapIcons.badgeHtml("Target"), "is-library-standard")
);

entries.forEach(function (entry) {
  var glyph = icons && icons.ICONS && icons.ICONS[entry.glyph];
  check(
    entry.id + " resolves to a valid base glyph",
    own(icons && icons.ICONS, entry.glyph) &&
      !!glyph &&
      /^icon-[a-z0-9-]+$/.test(glyph.id || "") &&
      /^[a-z0-9-]+$/.test(glyph.name || "") &&
      /^<(?:path|circle|rect|ellipse|line|polyline|polygon)\b/.test(
        glyph.svg || ""
      ),
    entry.glyph
  );

  var svg = mapIcons.html(entry.id, 18, "test-map-glyph");
  check(
    entry.id + " renders a complete SVG",
    /^<svg\b/.test(svg) &&
      has(svg, 'width="18"') &&
      has(svg, 'height="18"') &&
      has(svg, 'viewBox="0 0 24 24"') &&
      has(svg, "test-map-glyph") &&
      /<\/(?:svg)>$/.test(svg) &&
      !has(svg, "undefined") &&
      !has(svg, "null"),
    svg
  );
});

var standard = mapIcons.badgeHtml("Target");
check(
  "standard badge uses the standard size",
  has(standard, "copdoc-map-symbol") &&
    has(standard, "is-shape-circle") &&
    has(standard, "--map-symbol-size:32px") &&
    has(standard, 'width="30"') &&
    has(standard, "--map-symbol-fill:rgba(") &&
    !has(standard, "--map-symbol-opacity:") &&
    !has(standard, "is-compact") &&
    !has(standard, "is-primary")
);

var compact = mapIcons.badgeHtml("Target", { size: "compact" });
check(
  "compact badge uses compact sizing and class",
  has(compact, "is-compact") &&
    has(compact, "--map-symbol-size:24px") &&
    has(compact, 'width="22"')
);

var primary = mapIcons.badgeHtml("Target", {
  primary: true,
  badge: "12"
});
check(
  "primary badge uses primary sizing and class",
  has(primary, "is-primary") &&
    has(primary, "--map-symbol-size:38px") &&
    has(primary, 'width="36"') &&
    has(primary, '<i class="copdoc-map-symbol-badge">12</i>')
);

var selected = mapIcons.badgeHtml("Target", { selected: true });
check("selected badge has selected state", has(selected, "is-selected"));

var editable = mapIcons.badgeHtml("Target", { editable: true });
check("editable badge has editable state", has(editable, "is-editable"));

var light = mapIcons.badgeHtml("Target", { color: "#fff", fillOpacity: 0.5 });
check(
  "light badge expands shorthand color into fill",
  has(light, "--map-symbol-color:#ffffff") &&
    has(light, "--map-symbol-fill:rgba(255,255,255,0.5)")
);

var dark = mapIcons.badgeHtml("Target", { color: "#123456", fillOpacity: 0 });
check(
  "dark badge fill can be fully transparent",
  has(dark, "--map-symbol-color:#123456") &&
    has(dark, "--map-symbol-fill:rgba(18,52,86,0)")
);

var selectedEditable = mapIcons.badgeHtml("Target", {
  selected: true,
  editable: true
});
check(
  "badge states compose",
  has(selectedEditable, "is-selected") &&
    has(selectedEditable, "is-editable")
);

var diamond = mapIcons.badgeHtml("Hospital");
var wedge = mapIcons.badgeHtml("OfficerStart");
check("diamond semantic renders diamond shape", has(diamond, "is-shape-diamond"));
check("wedge semantic renders wedge shape", has(wedge, "is-shape-wedge"));

var numericSmall = mapIcons.badgeHtml("Target", { size: 1 });
var numericLarge = mapIcons.badgeHtml("Target", { size: 100 });
check(
  "numeric badge size clamps to minimum",
  has(numericSmall, "--map-symbol-size:20px") && has(numericSmall, "is-compact")
);
check(
  "numeric badge size clamps to maximum",
  has(numericLarge, "--map-symbol-size:56px") &&
    !has(numericLarge, "is-compact")
);

var sixDigitColor = mapIcons.badgeHtml("Target", { color: "#AbCdEf" });
check(
  "six-digit custom color is normalized",
  has(sixDigitColor, "--map-symbol-color:#abcdef")
);

var unsafeColor = "red;--map-symbol-size:999px;background:url(javascript:x)";
var rejectedColor = mapIcons.badgeHtml("Target", { color: unsafeColor });
check(
  "unsafe custom color falls back to semantic color",
  has(rejectedColor, "--map-symbol-color:#f0ad35") &&
    !has(rejectedColor, unsafeColor) &&
    !has(rejectedColor, "javascript:x")
);

var escapedBadge = mapIcons.badgeHtml("Target", { badge: '<&"x' });
check(
  "badge text is bounded and escaped",
  has(escapedBadge, "&lt;&amp;&quot;") && !has(escapedBadge, '<i class="copdoc-map-symbol-badge"><')
);

var importedUnknown = '\"><img src=x onerror="globalThis.pwned=true">';
var locationSvg = mapIcons.html("Location", 16);
var unknownSvg = mapIcons.html(importedUnknown, 16);
var unknownBadge = mapIcons.badgeHtml(importedUnknown);
check(
  "unknown imported semantic name falls back to location glyph",
  unknownSvg === locationSvg && !has(unknownSvg, importedUnknown),
  unknownSvg
);
check(
  "unknown imported semantic name is not reflected by badge renderer",
  !has(unknownBadge, importedUnknown) &&
    !has(unknownBadge, "onerror") &&
    has(unknownBadge, "--map-symbol-color:#8aa0ad"),
  unknownBadge
);
check(
  "unknown imported name has safe metadata fallbacks",
  mapIcons.entry(importedUnknown) === null &&
    mapIcons.label(importedUnknown) === "Location" &&
    mapIcons.isKnown(importedUnknown) === false
);
check(
  "general icon renderer does not reflect unknown names",
  icons.html(importedUnknown, 16) === ""
);

["__proto__", "constructor", "toString"].forEach(function (name) {
  var rendered = mapIcons.html(name, 16);
  check(
    "prototype-like imported name safely falls back: " + name,
    rendered === locationSvg &&
      !has(rendered, "undefined") &&
      !has(rendered, name),
    rendered
  );
  check(
    "prototype-like kind safely falls back: " + name,
    mapIcons.forKind(name).id === "Location"
  );
});

check(
  "kind aliases resolve to semantic entries",
  mapIcons.forKind("known parking").id === "Parking" &&
    mapIcons.forKind("plate-check").id === "Origin" &&
    mapIcons.forKind("not-a-kind").id === "Location"
);

var legacy = icons.html("Crosshair", 19, "legacy-icon");
check(
  "legacy Crosshair still renders",
  /^<svg\b/.test(legacy) &&
    has(legacy, 'width="19"') &&
    has(legacy, "legacy-icon") &&
    has(legacy, '<circle cx="12" cy="12" r="10" />') &&
    /<\/svg>$/.test(legacy)
);
check(
  "legacy general glyph is accepted by semantic renderer",
  mapIcons.html("Crosshair", 16) === icons.html("Crosshair", 16) &&
    mapIcons.isKnown("Crosshair")
);

context.document = { addEventListener: function () {} };
context.addEventListener = function () {};
require("./support/module-dependencies.js").loadScript(context, "functions/map-popup.js");
require("./support/module-dependencies.js").loadScript(context, "functions/location-map.js");
var locationMap = context.COPDoc && context.COPDoc.locationMap;
check(
  "location map honors a stored custom pin color",
  locationMap.pinColorFor("home", { pinColor: "#AbCdEf" }) === "#abcdef"
);
check(
  "location map derives vehicle marker color",
  locationMap.pinColorFor("vehicle", { vehicleColor: "Blue" }) === "#1565c0"
);
check(
  "location map accepts semantic fallback color",
  locationMap.pinColorFor("home", { defaultColor: "#8aa0ad" }) === "#8aa0ad"
);

if (fail) {
  process.exit(1);
}
console.log("ok map icons");
