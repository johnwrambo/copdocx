"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var fail = 0;

function check(label, ok, extra) {
  if (!ok) {
    fail += 1;
    console.log("FAIL", label, extra || "");
  } else {
    console.log("ok", label);
  }
}

function makeStorage(mem, options) {
  options = options || {};
  return {
    getItem: function (k) {
      return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
    },
    setItem: function (k, v) {
      if (options.throwOnWrite) {
        throw new Error("quota");
      }
      mem[k] = String(v);
    }
  };
}

function loadStore(mem, options) {
  var context = {
    window: {},
    localStorage: makeStorage(mem, options)
  };
  context.globalThis = context;
  context.window = context;
  vm.createContext(context);
  function load(rel) {
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "..", rel), "utf8"),
      context
    );
  }
  load("functions/model/util.js");
  load("functions/model/person.js");
  load("functions/model/store.js");
  return context.COPDoc.model;
}

function snap(id, last) {
  return {
    leadId: id,
    person: {
      personId: "p_" + id,
      name: { lastName: last || id, firstName: "X" }
    },
    people: []
  };
}

var mem = {};
var tabA = loadStore(mem);
var tabB = loadStore(mem);
var savedA = tabA.store.saveLead(snap("lead_a", "ALPHA"));
check("tab A save ok", savedA.ok === true, savedA);
var savedB = tabB.store.saveLead(snap("lead_b", "BRAVO"));
check("tab B save ok", savedB.ok === true, savedB);
var disk = JSON.parse(mem["copdocx.store.v1"]);
check("two tabs keep both leads", !!(disk.leads.lead_a && disk.leads.lead_b));
check(
  "tab B memory has A's lead after adopt",
  !!tabB.store.getLead("lead_a")
);

var corruptMem = { "copdocx.store.v1": "{not json" };
var corrupt = loadStore(corruptMem);
corrupt.store.loadFromDisk();
check(
  "corrupt JSON is not treated as empty",
  /damaged/.test(corrupt.store.diskError())
);
var corruptSave = corrupt.store.saveLead(snap("lead_x", "X"));
check("corrupt JSON blocks save", corruptSave.ok === false, corruptSave);
check(
  "corrupt payload is not overwritten",
  corruptMem["copdocx.store.v1"] === "{not json"
);

var quotaMem = {};
var quotaOpts = { throwOnWrite: false };
var quota = loadStore(quotaMem, quotaOpts);
check("quota store first save", quota.store.saveLead(snap("lead_keep", "KEEP")).ok);
quotaOpts.throwOnWrite = true;
var quotaFail = quota.store.saveLead(snap("lead_new", "NEW"));
check("quota failure returns error", quotaFail.ok === false, quotaFail);
check(
  "quota failure does not keep the new lead in memory",
  quota.store.getLead("lead_new") === null
);
check(
  "quota failure still has the previous lead",
  !!quota.store.getLead("lead_keep")
);
quotaOpts.throwOnWrite = false;
check(
  "disk still has only the previous lead",
  JSON.parse(quotaMem["copdocx.store.v1"]).leads.lead_keep &&
    !JSON.parse(quotaMem["copdocx.store.v1"]).leads.lead_new
);

if (fail) {
  process.exit(1);
}
console.log("ok store-save");
