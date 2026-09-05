"use strict";
// Emit classic prerequisite scripts explicitly. No browser loader or server is
// needed, so direct file:// openings preserve the existing deployment model.
const fs = require("fs"), path = require("path");
const { ROOT, dependencies } = require("./support/module-dependencies.js");
function wired(source) {
  const emitted = new Set();
  return source.replace(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (tag, src) => {
    const file = src.split(/[?#]/)[0].replace(/^\.\//, "");
    if (emitted.has(file)) return "";
    const insert = [];
    dependencies(file).forEach(dependency => {
      if (!emitted.has(dependency)) { insert.push('<script src="' + dependency + '"></script>'); emitted.add(dependency); }
    });
    emitted.add(file);
    return insert.concat(tag).join("\n    ");
  });
}
let changed = [];
for (const filename of fs.readdirSync(ROOT).filter(name => name.endsWith(".html"))) {
  const file = path.join(ROOT, filename), before = fs.readFileSync(file, "utf8"), after = wired(before);
  if (after !== before) {
    changed.push(filename);
    if (!process.argv.includes("--check")) fs.writeFileSync(file, after);
  }
}
if (process.argv.includes("--check") && changed.length) throw new Error("Host module prerequisites need regeneration: " + changed.join(", "));
console.log(process.argv.includes("--check") ? "Classic host prerequisites match the module manifest." : "Updated classic prerequisites in " + changed.length + " pages.");
module.exports = { wired };
