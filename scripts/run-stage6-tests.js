"use strict";

const fs = require("fs"), path = require("path"), { spawnSync } = require("child_process");
const gates = ["run-stage5.js"].concat(fs.readdirSync(__dirname).filter(name => /^test-stage6-.*\.js$/.test(name)).sort());
for (const gate of gates) {
  console.log("\n[stage6] " + gate);
  const result = spawnSync(process.execPath, [path.join(__dirname, gate)], { cwd: path.resolve(__dirname, ".."), encoding: "utf8" });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error || result.status !== 0) {
    console.error("[stage6] failed", gate, result.error || result.status);
    process.exit(result.status || 1);
  }
}
console.log("\nSTAGE6_BASELINE_PASSED", gates.length + "/" + gates.length + " gates passed.");
