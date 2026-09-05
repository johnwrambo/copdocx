"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { ROOT, manifest, dependencies } = require("./support/module-dependencies.js");

function filesUnder(directory, extension) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(full, extension) : full.endsWith(extension) ? [full] : [];
  });
}
const read = file => fs.readFileSync(path.join(ROOT, file), "utf8");
const entries = new Map(manifest.modules.map(entry => [entry.path, entry]));
const layers = new Set(["ui", "domain", "projection", "repository", "application", "document", "infrastructure", "compat"]);
assert.equal(manifest.schema, "copdocx.modules.v1");
assert.equal(manifest.version, 1);
assert.equal(entries.size, manifest.modules.length, "Each module has exactly one declared owner layer.");
const runtimeFiles = filesUnder(path.join(ROOT, "functions"), ".js").map(file => path.relative(ROOT, file).replace(/\\/g, "/")).filter(file => file !== "functions/module-manifest.js");
for (const file of runtimeFiles) assert(entries.has(file), "Unclassified runtime module: " + file);
for (const entry of manifest.modules) {
  assert(fs.existsSync(path.join(ROOT, entry.path)), "Missing declared module: " + entry.path);
  assert(layers.has(entry.layer), "Unknown architecture layer: " + entry.layer);
  assert(Array.isArray(entry.dependencies));
  assert.equal(new Set(entry.dependencies).size, entry.dependencies.length, "Duplicate prerequisites: " + entry.path);
  dependencies(entry.path); // validates required targets and rejects dependency cycles
  for (const dependency of entry.dependencies) {
    assert(entries.has(dependency), "Missing dependency declaration: " + dependency);
    if (["domain", "projection"].includes(entry.layer)) {
      assert(["domain", "projection"].includes(entries.get(dependency).layer), "Pure modules cannot depend on browser/UI/repository modules.");
    }
  }
}

const browserStorage = /\b(?:localStorage|sessionStorage|indexedDB)\s*(?:\?\.)?\s*[.\[]|\b(?:window|global|globalThis)\s*(?:\.\s*(?:localStorage|sessionStorage|indexedDB)\b|\[\s*["'](?:localStorage|sessionStorage|indexedDB)["']\s*\])|\b(?:const|let|var)\s+\w+\s*=\s*(?:localStorage|sessionStorage|indexedDB)\b/;
const withoutComments = source => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[\r\n])[ \t]*\/\/[^\r\n]*/g, "$1");
const rawPort = /\brepositories\s*(?:\.\s*storage\b|\[\s*["']storage["']\s*\])|\b(?:storagePort|rawStorage)\s*\./;
const dom = /\bdocument\s*(?:\?\.)?\s*[.\[]/;
const dynamicWrapper = /\bwith\s*\(|\beval\s*\(|\bnew\s+Function\s*\(/;
const uiFiles = manifest.modules.filter(entry => entry.layer === "ui");
for (const entry of uiFiles) {
  const source = withoutComments(read(entry.path));
  assert(!browserStorage.test(source), "UI directly accesses browser storage: " + entry.path);
  assert(!rawPort.test(source), "UI bypasses its repository through the raw storage port: " + entry.path);
}
const pureFiles = manifest.modules.filter(entry => ["domain", "projection"].includes(entry.layer));
for (const entry of pureFiles) {
  const source = read(entry.path);
  const code = withoutComments(source);
  assert(!browserStorage.test(code) && !rawPort.test(code), "Pure module reads ambient persistence: " + entry.path);
  assert(!dom.test(code), "Pure module reads DOM: " + entry.path);
  assert(!dynamicWrapper.test(code), "Extraction introduced a dynamic wrapper: " + entry.path);
  const context = { console, COPDoc: { model: {} } };
  context.window = context;
  for (const name of ["document", "localStorage", "sessionStorage", "indexedDB", "fetch"]) {
    Object.defineProperty(context, name, { get() { throw new Error(entry.path + " touched browser capability " + name + " during module load."); } });
  }
  vm.createContext(context);
  for (const dependency of dependencies(entry.path)) vm.runInContext(read(dependency), context, { filename: dependency });
  vm.runInContext(source, context, { filename: entry.path });
}

// No duplicate legacy implementation remains behind the new module boundary.
const moved = [
  ["functions/book-in.js", "renderCombinedPdf"],
  ["functions/model/store.js", "buildEncounterCompleted"],
  ["functions/model/store.js", "normalizeEncounterSubjectsForStore"],
  ["functions/model/store.js", "upsertBookInArrest"],
  ["functions/encounter-narrative.js", "bundleFromEncounterRecord"]
];
for (const [file, name] of moved) {
  assert(!new RegExp("\\bfunction\\s+" + name + "\\s*\\(").test(read(file)), file + " retains a duplicate " + name + " implementation.");
}

// Home imports load model scripts on demand. The VM helper cannot stand in
// for the production loader: every late target prerequisite must already be
// supplied by its host or explicitly loaded before the model script loop.
const transferEntry = entries.get("functions/transfer.js");
assert.deepEqual(transferEntry.dynamicDependencies, ["functions/model/store.js", "functions/model/media.js", "functions/baseball-card-contract.js"]);
const transferSource = read(transferEntry.path);
const lazyBoundaries = transferSource.match(/var boundaries = \[([\s\S]*?)\n    \];/);
assert(lazyBoundaries, "Home must declare its lazily loaded model boundary modules.");
const lazyFiles = Array.from(lazyBoundaries[1].matchAll(/["'](functions\/[^"']+\.js)["']/g), match => match[1]);
const availableBeforeTargets = new Set(dependencies(transferEntry.path).concat(lazyFiles));
assert(transferSource.indexOf("var boundaries =") < transferSource.indexOf("var sources =", transferSource.indexOf("async function ensureCanonicalBookInStore")), "Load domain factories before the lazy model scripts.");
for (const target of transferEntry.dynamicDependencies) {
  assert(entries.has(target), "Unclassified dynamic entrypoint: " + target);
  for (const dependency of dependencies(target)) {
    assert(availableBeforeTargets.has(dependency), "Home lazy loader misses a declared prerequisite for " + target + ": " + dependency);
  }
}

// Host declarations are the production loader: prerequisite scripts must be
// present once and earlier than every consumer, including file:// openings.
let hosts = 0;
for (const filename of fs.readdirSync(ROOT).filter(file => file.endsWith(".html"))) {
  const html = read(filename);
  const scripts = Array.from(html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi), match => match[1].split(/[?#]/)[0].replace(/^\.\//, ""));
  if (!scripts.some(file => entries.has(file))) continue;
  hosts++;
  for (let index = 0; index < scripts.length; index++) {
    const file = scripts[index];
    if (!entries.has(file)) continue;
    assert.equal(scripts.filter(candidate => candidate === file).length, 1, filename + " loads a module repeatedly: " + file);
    for (const dependency of dependencies(file)) {
      const dependencyIndex = scripts.indexOf(dependency);
      assert(dependencyIndex >= 0 && dependencyIndex < index, filename + " must load " + dependency + " before " + file);
    }
  }
}
assert(hosts >= 20, "Check all active application hosts, not only a new demo page.");
console.log("Stage 8 boundaries passed: " + manifest.modules.length + " classified modules, " + uiFiles.length + " UI files without raw persistence, " + pureFiles.length + " pure modules, " + hosts + " ordered hosts.");
