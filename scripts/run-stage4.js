"use strict";
const fs = require("fs"), path = require("path"), { spawnSync } = require("child_process");
const gates = ["run-stage3.js"].concat(fs.readdirSync(__dirname).filter(name => /^test-stage4-.*\.js$/.test(name)).sort());
for (const gate of gates) {
  console.log("\n[stage4] " + gate);
  const r = spawnSync(process.execPath, [path.join(__dirname, gate)], { cwd: path.resolve(__dirname, ".."), encoding: "utf8" });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.error || r.status !== 0) { console.error("[stage4] failed", gate, r.error || r.status); process.exit(r.status || 1); }
}
console.log("\nSTAGE4_BASELINE_PASSED", gates.length + "/" + gates.length + " gates passed.");
