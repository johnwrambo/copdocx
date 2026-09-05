"use strict";

// Tests and browser hosts share the reviewed dependency manifest. This loader
// executes real classic scripts; it adds neither runtime fallbacks nor mocks.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.resolve(__dirname, "..", "..");
const manifest = require(path.join(ROOT, "functions/module-manifest.js"));
const entries = new Map(manifest.modules.map(entry => [entry.path, entry]));
const loadedByContext = new WeakMap();

function dependencies(relativePath) {
  const ordered = [];
  const visited = new Set();
  const visiting = new Set();
  function visit(file) {
    if (visited.has(file)) return;
    if (visiting.has(file)) throw new Error("Circular module dependency: " + file);
    visiting.add(file);
    const entry = entries.get(file);
    if (!entry) throw new Error("Missing module manifest entry: " + file);
    entry.dependencies.forEach(visit);
    visiting.delete(file);
    visited.add(file);
    if (file !== relativePath) ordered.push(file);
  }
  if (entries.has(relativePath)) visit(relativePath);
  return ordered;
}

function loaded(context) {
  if (!loadedByContext.has(context)) loadedByContext.set(context, new Set());
  return loadedByContext.get(context);
}
function loadDependencies(context, relativePath) {
  const done = loaded(context);
  for (const dependency of dependencies(relativePath)) {
    if (done.has(dependency)) continue;
    vm.runInContext(fs.readFileSync(path.join(ROOT, dependency), "utf8"), context, { filename: dependency });
    done.add(dependency);
  }
  return context;
}
function loadScript(context, relativePath) {
  loadDependencies(context, relativePath);
  vm.runInContext(fs.readFileSync(path.join(ROOT, relativePath), "utf8"), context, { filename: relativePath });
  loaded(context).add(relativePath);
  return context;
}

module.exports = { ROOT, manifest, dependencies, loadDependencies, loadScript };
