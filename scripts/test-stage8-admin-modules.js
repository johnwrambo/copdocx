"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { createMemoryStorage } = require("./support/copdoc-vm-harness.js");
const ROOT = path.join(__dirname, "..");
const ADMIN = "copdoc.admin.v1", SETTINGS = "copdocx.settings.v1";
const STYLE = "copdocx.baseball.card-style.v1";
function plain(value) { return JSON.parse(JSON.stringify(value)); }
function setup(initial) {
  const memory = createMemoryStorage(initial);
  const c = { localStorage: memory.storage, console, Date, Math, Promise, setTimeout, clearTimeout };
  c.window = c; c.globalThis = c;
  vm.createContext(c);
  ["functions/repositories/browser-storage.js", "functions/repositories/admin.js", "functions/repositories/preferences.js", "functions/repositories/warrants.js", "functions/model/util.js", "functions/model/location.js", "functions/model/vehicle.js", "functions/model/officer.js", "functions/application/admin.js", "functions/officer-roster.js"].forEach(file => vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), c, { filename: file }));
  return { c, memory, repo: c.COPDoc.repositories, app: c.COPDoc.application.admin, legacy: c.COPDoc.officers };
}
function officer(id, extra) { return Object.assign({ id, officerId: id, firstName: "Casey", lastName: "EXAMPLE", meta: { status: "committed", committedAt: "2026-09-05" } }, extra); }
function ok(result) { assert(result && result.ok, result && result.error); return result; }

async function main() {
  {
    const original = { officers: [officer("of1", { extension: { preserve: true } })], vehicles: [], shifts: [], extension: ["future"] };
    const r = setup({ [ADMIN]: original });
    const before = r.memory.raw(ADMIN);
    const loaded = ok(r.repo.admin.read());
    loaded.data.officers[0].lastName = "DETACHED";
    assert.strictEqual(r.memory.raw(ADMIN), before, "reads never write or retain a mutable store singleton");
    assert.strictEqual(r.memory.writeCount(), 0);
    ok(r.app.saveOfficer({ officerId: "of1", lastName: "NEW" }));
    assert.strictEqual(r.legacy.get("of1").lastName, "NEW", "compatibility reads see the same canonical repository");
    assert.deepStrictEqual(r.memory.json(ADMIN).extension, ["future"]);
    assert.strictEqual(r.repo.admin.save(loaded).ok, false, "a stale repository snapshot cannot roll back an application command");
    assert.strictEqual(r.memory.json(ADMIN).officers[0].lastName, "NEW");
    assert.deepStrictEqual(r.memory.json(ADMIN).officers[0].extension, { preserve: true });
    r.memory.failNext(ADMIN);
    assert.strictEqual(r.legacy.saveOfficer({ officerId: "of1", lastName: "FAILED" }).ok, false);
    assert.strictEqual(r.repo.admin.getOfficer("of1").lastName, "NEW", "quota failure is shared by application and compatibility callers");
    r.memory.setRaw(ADMIN, "{ broken");
    assert.strictEqual(r.app.saveOfficer({ officerId: "of1", lastName: "DROP" }).ok, false);
    assert.strictEqual(r.memory.raw(ADMIN), "{ broken");
  }
  {
    // Display-only legacy reads must not acquire new whole-roster validation.
    const r = setup({ [ADMIN]: { officers: [{ firstName: "Legacy", custom: true }], vehicles: "invalid for mutation" } });
    assert.deepStrictEqual(plain(r.repo.admin.readSnapshot()), { officers: [{ firstName: "Legacy", custom: true }], vehicles: "invalid for mutation" });
    assert.strictEqual(r.repo.admin.read().ok, false);
    assert.strictEqual(r.memory.writeCount(), 0);
  }
  {
    const r = setup({ [ADMIN]: { officers: [officer("of1"), officer("of2", { inactive: true })], vehicles: [], shifts: [], custom: 19 } });
    ok(r.app.addShift({ date: "2026-09-05", officerId: "of1", start: "07:00", custom: "not a shift field" }));
    const shift = r.memory.json(ADMIN).shifts[0];
    assert.match(shift.id, /^sft-[a-z0-9]+-[a-z0-9]+$/, "schedule identity retains its prior format");
    assert.strictEqual(shift.start, "07:00");
    assert.strictEqual(shift.end, "14:00");
    assert.strictEqual(r.memory.json(ADMIN).custom, 19);
    assert.strictEqual(r.app.addShift({ date: "2026-09-05", officerId: "of2" }).ok, false);
    r.memory.failNext(ADMIN);
    assert.strictEqual(r.app.removeShift(shift.id, shift).ok, false);
    assert.strictEqual(r.memory.json(ADMIN).shifts.length, 1);
    const changed = r.memory.json(ADMIN);
    changed.shifts[0].assignment = "Changed in another window";
    r.memory.setRaw(ADMIN, changed);
    assert.strictEqual(r.app.removeShift(shift.id, shift).ok, false, "confirmation is tied to the reviewed shift");
    ok(r.app.removeScheduleAssignments("officers", "of1", changed.shifts));
    assert.strictEqual(r.memory.json(ADMIN).shifts.length, 0);
  }
  {
    const r = setup({ [SETTINGS]: { issuingOffice: "Old", custom: { future: true }, arrestReportRoster: { extension: "retained" } }, [STYLE]: { version: 2, layout: { width: 1050 }, custom: true } });
    assert.strictEqual(r.memory.writeCount(), 0);
    r.repo.preferences.patchSettings({ issuingOffice: "New", lastOfficerId: "of1" });
    r.repo.preferences.saveArrestRoster({ version: 1, visibleColumns: ["name"], sortKey: "name", sortDirection: "asc" });
    const settings = r.memory.json(SETTINGS);
    assert.strictEqual(settings.issuingOffice, "New");
    assert.deepStrictEqual(settings.custom, { future: true });
    assert.strictEqual(settings.arrestReportRoster.extension, "retained");
    assert.deepStrictEqual(plain(r.repo.preferences.readArrestRoster()).visibleColumns, ["name"]);
    assert.deepStrictEqual(plain(r.repo.preferences.readBaseballStyle()), { version: 2, layout: { width: 1050 }, custom: true });
    r.repo.preferences.saveBaseballStyle({ version: 2, layout: { width: 900 }, future: "kept" });
    assert.strictEqual(r.memory.json(STYLE).future, "kept");
    const before = r.memory.raw(SETTINGS);
    r.memory.failNext(SETTINGS);
    assert.throws(() => r.repo.preferences.patchSettings({ issuingOffice: "Failed" }));
    assert.strictEqual(r.memory.raw(SETTINGS), before);
    r.memory.setRaw(SETTINGS, "{ damaged");
    assert.throws(() => r.repo.preferences.patchSettings({ issuingOffice: "Never replace damaged settings" }));
    assert.strictEqual(r.memory.raw(SETTINGS), "{ damaged");
  }
  {
    const r = setup();
    const state = { exists: false, stored: null, closes: 0, abort: false, names: [] };
    r.c.indexedDB = { open(name, version) {
      state.names.push([name, version]);
      const req = {};
      const db = {
        objectStoreNames: { contains: name => state.exists && name === "handles" },
        createObjectStore(name) { assert.strictEqual(name, "handles"); state.exists = true; },
        close() { state.closes += 1; },
        transaction(name, mode) {
          assert.strictEqual(name, "handles");
          const tx = { objectStore() { return {
            get(key) { assert.strictEqual(key, "warrantsDirectory"); return request(null); },
            put(handle, key) { assert.strictEqual(key, "warrantsDirectory"); return request(handle); }
          }; } };
          function request(handle) {
            const req = {};
            queueMicrotask(() => {
              req.result = mode === "readonly" ? state.stored : "warrantsDirectory";
              if (req.onsuccess) req.onsuccess();
              queueMicrotask(() => {
                if (state.abort) { tx.error = new Error("simulated abort after request success"); tx.onabort(); }
                else { if (mode === "readwrite") state.stored = handle; tx.oncomplete(); }
              });
            });
            return req;
          }
          return tx;
        }
      };
      queueMicrotask(() => { req.result = db; if (!state.exists) req.onupgradeneeded(); req.onsuccess(); });
      return req;
    } };
    const handle = { name: "warrants", kind: "directory" };
    assert.strictEqual(await r.repo.warrants.loadDirectoryHandle(), null);
    assert.strictEqual(await r.repo.warrants.saveDirectoryHandle(handle), handle);
    assert.strictEqual(await r.repo.warrants.loadDirectoryHandle(), handle);
    state.abort = true;
    await assert.rejects(r.repo.warrants.saveDirectoryHandle({ name: "failed" }), /abort/);
    assert.strictEqual(state.stored, handle, "request success is not treated as a committed directory handle");
    assert.strictEqual(state.closes, 4, "all handle transactions close their database connection");
    assert(state.names.every(([name, version]) => name === "copdocx.warrants" && version === 1), "same existing IndexedDB contract");
  }
  console.log("ok Stage 8 Admin commands, preferences, compatibility and warrant repository boundaries");
}
main().catch(error => { console.error(error); process.exit(1); });
