"use strict";
const fs = require("fs"), path = require("path"), { spawnSync } = require("child_process");
const gates = ["run-stage6-tests.js"].concat(fs.readdirSync(__dirname).filter(name => /^test-stage7-.*\.js$/.test(name)).sort());
for (const gate of gates) {
  console.log("\n[stage7] " + gate);
  const result = spawnSync(process.execPath, [path.join(__dirname, gate)], { cwd: path.resolve(__dirname, ".."), encoding: "utf8" });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
console.log("\nSTAGE7_BASELINE_PASSED", gates.length + "/" + gates.length + " gates passed.");
