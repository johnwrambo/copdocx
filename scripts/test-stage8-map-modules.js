"use strict";
const assert = require("assert"), fs = require("fs"), path = require("path"), vm = require("vm");
const { createMemoryStorage } = require("./support/copdoc-vm-harness");
const ROOT = path.join(__dirname, "..");
function load(context, file) { vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), context, {filename: file}); }
function tab(local = createMemoryStorage(), session = createMemoryStorage()) {
  const context = { localStorage: local.storage, sessionStorage: session.storage };
  context.window = context; context.globalThis = context; vm.createContext(context);
  ["functions/workspace-config.js", "functions/repositories/browser-storage.js", "functions/repositories/view-state.js"].forEach(file => load(context, file));
  return {context, local, session, view: context.COPDoc.repositories.viewState};
}
function plain(value) { return JSON.parse(JSON.stringify(value)); }
function deepFreeze(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(deepFreeze); Object.freeze(value); }
  return value;
}

// Every semantic repository method retains the exact registered medium, key and
// serialization; malformed data and write failures must reach existing UI catches.
{
  const r = tab(), v = r.view;
  const mapCases = [
    ["MapLayers", "copdocx.map.layers.v1", { visible: { targets: true, origin: false } }],
    ["MapIcons", "copdocx.map.icons.v1", { libraryId: "default", hiddenPins: { "pin-1": true }, unknownExtension: 4 }],
    ["MapViews", "copdocx.map.views.v1", { home: { lat: 32, lng: -97, zoom: 8 }, presets: [] }],
    ["MapMarkup", "copdocx.map.markup.v1", { labels: [{ id: "label-1", text: "Fixture" }], arrows: [] }]
  ];
  for (const [name, key, value] of mapCases) {
    assert.strictEqual(v["load" + name](), undefined);
    v["save" + name](value);
    assert.strictEqual(r.local.storage.getItem(key), JSON.stringify(value));
    const loaded = v["load" + name](); loaded.changed = true;
    assert.strictEqual(r.local.storage.getItem(key), JSON.stringify(value), "detached read cannot persist mutations");
    r.local.failNext(key);
    assert.throws(() => v["save" + name]({changed: true}), /Injected/);
    assert.strictEqual(r.local.storage.getItem(key), JSON.stringify(value), "failed save retains old bytes");
    r.local.storage.setItem(key, "{broken");
    assert.throws(() => v["load" + name](), /JSON|property|position|Unexpected/i);
  }
  v.saveBasemap("hybrid");
  assert.strictEqual(r.local.storage.getItem("copdocx.location-map.basemap"), "hybrid", "basemap remains a raw string");
  assert.strictEqual(v.loadBasemap(), "hybrid");
  r.local.storage.setItem("copdocx.map.icons.v1", JSON.stringify({ hiddenPins: { one: true }, unknownExtension: 4 }));
  v.saveMapIconLibrary("tactical");
  assert.deepStrictEqual(plain(v.loadMapIcons()), { hiddenPins: { one: true }, unknownExtension: 4, libraryId: "tactical" }, "library choice preserves other icon preferences");
  const windows = { plates: false, objects: true, card: true, pos: { plates: {x: 2, y: 3}, objects: null, card: null } };
  v.saveInvestigationWindows(windows);
  assert.strictEqual(r.session.storage.getItem("copdocx.investigation-windows.v1"), JSON.stringify(windows));
  assert.strictEqual(r.local.storage.getItem("copdocx.investigation-windows.v1"), null);
  const other = tab(r.local);
  assert.strictEqual(other.view.loadBasemap(), "hybrid", "local view settings cross tabs");
  assert.strictEqual(other.view.loadInvestigationWindows(), undefined, "window positions remain tab scoped");
  assert.strictEqual(r.context.COPDoc.config.storageEntries.length, 25, "no Stage 8 store or schema migration");
}
{
  const r = tab(), v = r.view;
  const files = deepFreeze([{ id: "small", bytes: 1, dataUrl: "small" }, { id: "large", bytes: 101, dataUrl: "large", extension: { keep: true } }]);
  v.saveDemoFiles(files, "large", 100);
  assert.strictEqual(r.local.storage.getItem("copdocx.file-upload.v1"), JSON.stringify({ schema: "copdocx.file-upload.v1", files: [files[0], { ...files[1], dataUrl: "", sessionOnly: true }], selectedId: "large" }));
  assert.strictEqual(files[1].dataUrl, "large", "large demo payload filtering must never mutate editor state");
  const photos = [{ id: "photo", dataUrl: "photo", crop: {x: 1, y: 2}, tags: ["fixture"] }];
  v.saveDemoPhotos(photos, "photo");
  assert.strictEqual(r.local.storage.getItem("copdocx.photo-picker.v1"), JSON.stringify({ schema: "copdocx.photo-picker.v1", photos, selectedId: "photo" }));
  assert.deepStrictEqual(plain(v.loadDemoPhotos().photos), photos);
  for (let i = 0; i < 26; i++) v.putGeocode("query-" + i, { latitude: i, longitude: -i });
  assert.strictEqual(v.getGeocode("query-0"), null, "oldest geocode evicted at 25 entries");
  assert.deepStrictEqual(plain(v.getGeocode("query-25")), { latitude: 25, longitude: -25 });
  assert.strictEqual(Object.keys(JSON.parse(r.session.storage.getItem("addrGeoCache_v1"))).length, 25);
  assert.strictEqual(r.local.storage.getItem("addrGeoCache_v1"), null);
  const before = r.session.storage.getItem("addrGeoCache_v1");
  r.session.failNext("addrGeoCache_v1");
  assert.throws(() => v.putGeocode("query-next", { latitude: 10 }), /Injected/);
  assert.strictEqual(r.session.storage.getItem("addrGeoCache_v1"), before);
}

// Frozen Stage 7 golden output covers completed snapshots, live-only exclusion,
// shared-location fallback, nested vehicle places, legacy Person joins and peaks.
{
  const fixture = deepFreeze(JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/stage8-map-golden.json"), "utf8")));
  const context = {}; context.window = context; context.globalThis = context; vm.createContext(context);
  Object.defineProperty(context, "document", { get() { throw new Error("Projection read DOM"); } });
  Object.defineProperty(context, "localStorage", { get() { throw new Error("Projection read storage"); } });
  load(context, "functions/projections/map.js");
  const project = context.COPDoc.projections.map;
  const before = JSON.stringify(fixture.workspace);
  assert.deepStrictEqual(plain(project.completedEncounters(fixture.workspace)), fixture.expected.encounters);
  assert.deepStrictEqual(plain(fixture.pinCases.map(row => project.encounterPin(row, fixture.workspace))), fixture.expected.pins);
  assert.deepStrictEqual(plain(fixture.hydrationCases.map(row => project.hydrateLocation(row, fixture.workspace))), fixture.expected.hydrations);
  assert.deepStrictEqual(plain(project.heatPeaks(fixture.points, 0.05)), fixture.expected.peaks);
  assert.strictEqual(JSON.stringify(fixture.workspace), before, "map projection cannot modify historical data");
  assert.deepStrictEqual([8,9,11,13,15].map(zoom => project.heatCellSize(zoom)), [0.06,0.03,0.014,0.007,0.0035]);
  assert.deepStrictEqual(plain(project.heatPeaks([{lat: 1,lng: 1},{lat: 1,lng: 1},{lat: 1.1,lng: 1},{lat: 1.1,lng: 1}],0.1)), [], "equal adjacent peaks remain suppressed");
  const arrest = deepFreeze({latitude: "32", longitude: "-97", hasCoords: true});
  const points = project.heatPoints([arrest, {hasCoords: false}]);
  assert.strictEqual(points.length, 1); assert.strictEqual(points[0].lat,32); assert.strictEqual(points[0].row,arrest);
}
console.log("ok Stage 8 map repositories and frozen projection compatibility");
