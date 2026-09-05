"use strict";

const assert = require("assert"), crypto = require("crypto");
const { createMemoryStorage, createTab, loadScript, quietConsole } = require("./support/copdoc-vm-harness");
const clone = value => JSON.parse(JSON.stringify(value));
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=";

function setup(options = {}) {
  const storage = createMemoryStorage({ "copdocx.map.markup.v1": { labels: [{ id: "label-1", lat: 31, lng: -99, text: "Saved label" }], arrows: [{ id: "arrow-1", from: [31, -99], to: [32, -98] }] } });
  const r = { storage, statuses: [], prints: [], frames: [], contexts: [], runs: [], options, markerText: "Captured target", center: { lat: 31, lng: -99 }, canvasCalls: [] };
  function img(url) {
    const attributes = { src: url }, node = { tagName: "IMG", width: 256, height: 256, complete: true, naturalWidth: 256,
      getAttribute: name => attributes[name] || "", setAttribute(name, value) { attributes[name] = String(value); },
      addEventListener() {}, removeEventListener() {}, style: {} };
    Object.defineProperty(node, "src", { get: () => attributes.src, set: value => { attributes.src = value; } });
    Object.defineProperty(node, "outerHTML", { get: () => '<img ' + Object.keys(attributes).map(key => key + '="' + attributes[key] + '"').join(" ") + ' width="' + node.width + '" height="' + node.height + '">' });
    return node;
  }
  r.tile = img("https://tiles.example.test/7/2/3.png");
  if (options.missingTile) r.tile.naturalWidth = 0;
  function mapNode(captured) {
    const text = captured ? r.markerText : null, tile = captured ? img(r.tile.src) : r.tile;
    let replacement = null;
    const canvas = { width: 640, height: 480,
      attributes: [{ name: "class", value: "leaflet-zoom-animated" }, { name: "style", value: "width:320px;height:240px;transform:translate3d(10px,20px,0)" }],
      toDataURL(type) { r.canvasCalls.push(type); if (options.taintedCanvas) throw new Error("Tainted canvas"); return PNG; },
      replaceWith(image) { replacement = image; }, outerHTML: '<canvas class="leaflet-zoom-animated" width="640" height="480"></canvas>' };
    const node = { style: {}, classList: { toggle() {} },
      getBoundingClientRect: () => ({ width: 1200, height: 800 }),
      cloneNode: () => mapNode(true),
      querySelectorAll(selector) {
        if (selector === "canvas") return options.canvas && !replacement ? [canvas] : [];
        if (selector === "img") return replacement ? [tile, replacement] : [tile];
        return [];
      } };
    Object.defineProperty(node, "outerHTML", { get: () => '<div id="map" class="map leaflet-container"><div class="leaflet-pane">' + tile.outerHTML + '<svg><text>' + (captured ? text : r.markerText) + '</text></svg>' + (options.canvas ? (replacement || canvas).outerHTML : "") + '</div></div>' });
    return node;
  }
  r.map = mapNode(false);
  const legend = { hidden: true, cloneNode: () => ({ hidden: false, outerHTML: '<div id="mapBriefLegend" class="map-brief-legend">Captured legend</div>' }) };
  const stylesheet = { tagName: "LINK", href: "https://copdoc.test/style/style.css", cloneNode() { let href = this.href; return { tagName: "LINK", setAttribute(_key, value) { href = value; }, get outerHTML() { return '<link rel="stylesheet" href="' + href + '">'; } }; } };
  const document = { readyState: "loading", baseURI: "https://copdoc.test/map.html", addEventListener() {},
    getElementById: id => id === "map" ? r.map : id === "mapBriefLegend" ? legend : null,
    querySelectorAll: selector => selector === 'link[rel="stylesheet"], style' ? [stylesheet] : [],
    body: { classList: { toggle() {} }, appendChild(frame) { r.frames.push(frame); Promise.resolve().then(() => frame.onload()); } },
    createElement(tag) {
      if (tag === "img") return img("");
      assert.strictEqual(tag, "iframe");
      const frame = { style: {}, attributes: {}, setAttribute(key, value) { this.attributes[key] = value; }, remove() { this.removed = true; }, srcdoc: "" };
      frame.contentDocument = { querySelectorAll(selector) {
        if (selector === 'link[rel="stylesheet"]') return [{ sheet: options.missingStylesheet ? null : {} }];
        if (selector === "img") return Array.from(frame.srcdoc.matchAll(/<img[^>]*src="([^"]*)"/g), match => { const image = img(match[1]); if (options.missingPrintImage) image.naturalWidth = 0; return image; });
        return [];
      } };
      const listeners = {};
      frame.contentWindow = { addEventListener(name, fn) { listeners[name] = fn; }, focus() {}, print() {
        if (options.printThrows) throw new Error("Synthetic browser print failure");
        r.prints.push(frame.srcdoc);
        if (options.receiptFails) storage.failNext(r.context.COPDoc.documents.storageKey);
        if (listeners.afterprint) listeners.afterprint();
      } };
      return frame;
    }
  };
  const context = createTab(storage, { document, console: quietConsole(), location: { href: document.baseURI, pathname: "/map.html", search: "" } });
  r.context = context;
  context.crypto = crypto.webcrypto; context.TextEncoder = TextEncoder;
  context.getComputedStyle = () => ({getPropertyValue: property => ({position:"absolute",display:"block",left:"0px",top:"0px",width:"320px",height:"240px"})[property] || ""});
  context.navigator.locks = { request: async (_name, _options, callback) => callback() };
  context.setTimeout = (callback, ms) => { const timer = setTimeout(callback, ms <= 200 ? 0 : ms); if (timer.unref && ms > 200) timer.unref(); return timer; };
  context.COPDoc = { setAppBarStatus(message, status) { r.statuses.push({ message, status }); }, map: {
    leaflet: { on() {}, stop() {}, getCenter: () => r.center, getZoom: () => 9 }, basemap: "hybrid", resize() {},
    layerVisible: key => key === "targets" || key === "markup", rowVisible: () => true,
    getVisualFilters: () => [{ id: "wanted", enabled: true }], getIconSize: () => 32,
    catalog: { targets: [{ category: "targets", id: "targets:loc-1", leadId: "lead-1", personId: "person-1", locationId: "loc-1", subject: "Captured target", latitude: 31, longitude: -99 }], officers: [{ officerId: "hidden-officer" }] }
  } };
  ["functions/workspace-config.js", "functions/document-context.js", "functions/document-registry.js", "functions/document-fingerprints.js", "functions/document-generation.js", "functions/map-markup.js"].forEach(file => loadScript(context, file));
  const generate = context.COPDoc.documents.generate;
  context.COPDoc.documents.generate = async config => {
    r.contexts.push(config.context);
    if (options.mutateAfterCapture) {
      r.markerText = "Changed after capture"; r.center.lat = 42; r.tile.src = "https://tiles.example.test/later.png";
      context.COPDoc.map.catalog.targets[0].subject = "Changed after capture";
    }
    if (options.receiptStartFails) storage.failNext(context.COPDoc.documents.storageKey);
    const result = await generate(config); r.runs.push(result); return result;
  };
  return r;
}

async function capturedPrintAndCanvas() {
  const r = setup({ mutateAfterCapture: true, canvas: true });
  await r.context.printMapBrief();
  assert.strictEqual(r.prints.length, 1, JSON.stringify(r.statuses));
  const captured = r.contexts[0], printed = r.prints[0];
  assert.ok(Object.isFrozen(captured.input) && Object.isFrozen(captured.input.map));
  assert.strictEqual(captured.input.map.center.lat, 31);
  assert.strictEqual(captured.input.rows[0].subject, "Captured target");
  assert.strictEqual(captured.input.markup.labels[0].text, "Saved label");
  assert.strictEqual(captured.input.map.basemap, "hybrid");
  assert.ok(captured.sources.some(source => source.type === "PERSON" && source.id === "person-1" && source.authority === "snapshot"));
  assert.ok(!captured.sources.some(source => source.id === "hidden-officer"));
  assert.strictEqual(printed, captured.input.html);
  assert.match(printed, /Captured target/); assert.doesNotMatch(printed, /Changed after capture|later\.png/);
  assert.ok(printed.includes(PNG), "canvas pixels are baked into the exact recorded print HTML");
  assert.doesNotMatch(printed, /<canvas/);
  assert.match(printed, /width:320px;height:240px;transform:translate3d\(10px,20px,0\)/);
  assert.match(printed, /width="640" height="480"/);
  assert.match(printed, /position:absolute;display:block;left:0px;top:0px/,
    "Canvas-specific Leaflet positioning survives replacement with an image");
  assert.match(printed, /body #map\{position:relative;margin:0!important/,
    "Detached maps do not inherit the generic map margin and clip the captured viewport");
  assert.deepStrictEqual(r.canvasCalls, ["image/png"]);
  assert.ok(captured.input.tiles.some(tile => tile.url === PNG));
  assert.strictEqual(r.frames[0].attributes.sandbox, "allow-same-origin allow-modals");
  assert.strictEqual(r.frames[0].removed, true, "afterprint releases the detached snapshot without changing the live map");
  const record = r.context.COPDoc.documents.get(r.runs[0].record.generationId);
  assert.strictEqual(record.outputHash, crypto.createHash("sha256").update(printed).digest("hex"));
  assert.strictEqual(record.deliveries[0].status, "SUBMITTED");
  assert.strictEqual(record.deliveries[0].method, "print");
}

async function failureBoundaries() {
  for (const [options, expected, generated] of [
    [{ missingTile: true }, /map image could not be loaded/i, false],
    [{ canvas: true, taintedCanvas: true }, /canvas map layer could not be captured/i, false],
    [{ receiptStartFails: true }, /history could not be saved/i, false],
    [{ missingPrintImage: true }, /map image could not be loaded/i, true],
    [{ missingStylesheet: true }, /stylesheet could not be loaded/i, true],
    [{ printThrows: true }, /browser print failure/i, true]
  ]) {
    const r = setup(options);
    await r.context.printMapBrief();
    assert.strictEqual(r.prints.length, 0, JSON.stringify(options));
    assert.match(r.statuses.at(-1).message, expected);
    if (generated) {
      const record = r.context.COPDoc.documents.get(r.runs[0].record.generationId);
      assert.strictEqual(record.status, "GENERATED");
      assert.strictEqual(record.deliveries.at(-1).status, "FAILED");
      assert.ok(r.frames.every(frame => frame.removed));
    } else {
      assert.strictEqual(r.frames.length, 0, "no print frame is delivered before a durable generation receipt");
    }
  }
  const quota = setup({ receiptFails: true });
  await quota.context.printMapBrief();
  assert.strictEqual(quota.prints.length, 1);
  const record = quota.context.COPDoc.documents.get(quota.runs[0].record.generationId);
  assert.strictEqual(record.status, "GENERATED");
  assert.deepStrictEqual(clone(record.deliveries), [], "post-print annotation failure never manufactures a FAILED delivery");
  assert.match(quota.statuses.at(-1).message, /was sent to print, but its delivery receipt could not be saved/);
}

(async () => {
  await capturedPrintAndCanvas();
  await failureBoundaries();
  console.log("STAGE7_MAP_DOCUMENTS_PASSED exact detached print HTML, frozen map/markup/row identities, canvas PNG capture, resource failures, receipt-before-print and post-print quota accuracy.");
})().catch(error => { console.error(error); process.exitCode = 1; });
