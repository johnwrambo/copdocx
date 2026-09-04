const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const context = {};
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.join(root, "functions", "workspace-config.js"), "utf8"),
  context
);

const entries = context.COPDoc.config.storageEntries.map((entry) => ({
  id: entry.id,
  key: entry.key,
  medium: entry.medium,
  portable: entry.portable
}));
const registered = new Set(entries.map((entry) => entry.key));
assert.strictEqual(registered.size, entries.length, "storage keys must be unique");

function filesUnder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(full) : full.endsWith(".js") ? [full] : [];
  });
}

const missing = [];
for (const file of filesUnder(path.join(root, "functions"))) {
  const source = fs.readFileSync(file, "utf8");
  const patterns = [
    /\b[A-Z][A-Z0-9_]*(?:KEY|DB_NAME|IDB_NAME)\s*=\s*["']((?:copdocx?|alien-book-in|opdoc|addrGeoCache)[a-z0-9._-]+)["']/gi,
    /(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)\(\s*["']((?:copdocx?|alien-book-in|opdoc|addrGeoCache)[a-z0-9._-]+)["']/gi,
    /indexedDB\.open\(\s*["']((?:copdocx?|alien-book-in|opdoc|addrGeoCache)[a-z0-9._-]+)["']/gi
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) {
      if (!registered.has(match[1])) {
        missing.push(`${path.relative(root, file)}: ${match[1]}`);
      }
    }
  }
}
assert.deepStrictEqual(missing, [], "every persistence key must be registered");

const portableIds = entries.filter((entry) => entry.portable).map((entry) => entry.id);
[
  "workspace",
  "admin",
  "bookin",
  "settings",
  "mapViews",
  "mapLayers",
  "mapIcons",
  "mapMarkup",
  "mapBasemap",
  "narrativeTemplates"
].forEach((id) => assert.ok(portableIds.includes(id), `${id} should be portable`));

console.log(`ok storage registry (${entries.length} entries)`);
