"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var mem = {};
var context = {
  window: {},
  console: console,
  Date: Date,
  JSON: JSON,
  Array: Array,
  Object: Object,
  localStorage: {
    getItem: function (k) {
      return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
    },
    setItem: function (k, v) {
      mem[k] = String(v);
    }
  }
};
context.globalThis = context;
context.window = context;
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "..", "functions/transfer.js"), "utf8"),
  context
);

var t = context.COPDoc.transfer;
var fail = 0;

function check(label, ok, extra) {
  if (!ok) {
    fail += 1;
    console.log("FAIL", label, extra || "");
  } else {
    console.log("ok", label);
  }
}

mem["copdocx.store.v1"] = JSON.stringify({
  schema: "copdocx.store.v1",
  currentLeadId: "",
  people: {},
  leads: {
    lead_a: {
      leadId: "lead_a",
      person: { personId: "p_a", name: { lastName: "GARCIA", firstName: "LUIS" } },
      meta: { status: "committed", updatedAt: "2026-08-01T12:00:00.000Z", committedAt: "2026-08-01T12:00:00.000Z" }
    },
    lead_draft: {
      leadId: "lead_draft",
      person: { personId: "p_d", name: { lastName: "DRAFT", firstName: "X" } },
      meta: { status: "draft", updatedAt: "2026-08-20T12:00:00.000Z" }
    },
    lead_b: {
      leadId: "lead_b",
      person: { personId: "p_b", name: { lastName: "PEREZ", firstName: "ANA" } },
      meta: { status: "committed", updatedAt: "2026-08-20T12:00:00.000Z", committedAt: "2026-08-20T12:00:00.000Z" }
    }
  },
  encounters: {
    enc_a: {
      encounterId: "enc_a",
      startedAt: "2026-08-20T12:00:00.000Z",
      vehicles: [{ licensePlate: "ABC123" }],
      locations: [{ street: "1 Main", city: "Dallas", state: "TX" }],
      subjects: [{ lastName: "LOKI", firstName: "Laufeyson" }],
      meta: { status: "committed", updatedAt: "2026-08-20T12:00:00.000Z", committedAt: "2026-08-20T12:00:00.000Z" }
    },
    enc_draft: {
      encounterId: "enc_draft",
      meta: { status: "draft", updatedAt: "2026-08-21T12:00:00.000Z" }
    }
  }
});
mem["copdoc.admin.v1"] = JSON.stringify({
  officers: [
    {
      id: "ofc_1",
      officerId: "ofc_1",
      lastName: "REYES",
      firstName: "Maria",
      meta: { status: "committed", updatedAt: "2026-08-10T00:00:00.000Z" }
    }
  ],
  vehicles: [],
  shifts: [{ id: "sft_1", date: "2026-08-15", officerId: "ofc_1" }]
});
mem["alien-book-in.saved-records.v1"] = JSON.stringify([
  { id: "bk_1", lastName: "GARCIA", firstName: "LUIS", aNumber: "000111222", updatedAt: "2026-08-18T00:00:00.000Z" }
]);

var leads = t.listType("leads");
check("export skips drafts", leads.length === 2 && !leads.some(function (r) { return r.leadId === "lead_draft"; }));

var ranged = t.filterRecords(leads, "leads", "2026-08-10", "2026-08-31");
check("date range filters leads", ranged.length === 1 && ranged[0].leadId === "lead_b");

var bundle = t.collectExport(["officers"], "", "");
check("officers-only bundle", bundle.officers.length === 1 && bundle.leads.length === 0 && bundle.format === "copdocx.transfer.v1");

var none = t.collectExport(["leads"], "2020-01-01", "2020-01-02");
check("empty range", none.leads.length === 0);

try {
  t.parseTransfer("{not json");
  check("bad json throws", false);
} catch (error) {
  check("bad json throws", /not valid JSON/.test(error.message));
}

var fromArray = t.parseTransfer(JSON.stringify([{ leadId: "lead_z", meta: { status: "committed" } }]));
check("legacy leads array", fromArray.leads.length === 1 && fromArray.leads[0].leadId === "lead_z");

var fromBook = t.parseTransfer(JSON.stringify({
  format: "alien-book-in-records",
  records: [{ id: "bk_9", lastName: "X" }]
}));
check("legacy book-in backup", fromBook.bookin.length === 1 && fromBook.bookin[0].id === "bk_9");

var incoming = t.parseTransfer(JSON.stringify({
  format: "copdocx.transfer.v1",
  officers: [
    {
      id: "ofc_1",
      officerId: "ofc_1",
      lastName: "REYES",
      firstName: "Maria",
      meta: { status: "committed", updatedAt: "2026-08-10T00:00:00.000Z" }
    },
    {
      id: "ofc_2",
      officerId: "ofc_2",
      lastName: "LEE",
      firstName: "Sam",
      meta: { status: "committed", updatedAt: "2026-08-11T00:00:00.000Z" }
    }
  ]
}));
var stats = t.applyImport(incoming, ["officers"]);
check("import adds new officer", stats.added === 1, stats);
check("import skips exact duplicate", stats.skipped === 1, stats);
var after = JSON.parse(mem["copdoc.admin.v1"]);
check("admin still has two officers", after.officers.length === 2);

incoming.officers[0].role = "IO";
var stats2 = t.applyImport(incoming, ["officers"]);
check("import replaces different same id", stats2.updated === 1, stats2);

var draftIn = t.cleanList("leads", [
  { leadId: "x", meta: { status: "draft" } },
  { leadId: "y", meta: { status: "committed" } }
]);
check("cleanList drops drafts", draftIn.rows.length === 1 && draftIn.skipped === 1);

var encs = t.listType("encounters");
check(
  "export skips draft encounters",
  encs.length === 1 && encs[0].encounterId === "enc_a"
);

var encImport = t.parseTransfer(JSON.stringify({
  format: "copdocx.transfer.v1",
  encounters: [
    {
      encounterId: "enc_a",
      startedAt: "2026-08-20T12:00:00.000Z",
      vehicles: [{ licensePlate: "ABC123" }],
      locations: [{ street: "1 Main", city: "Dallas", state: "TX" }],
      subjects: [{ lastName: "LOKI", firstName: "Laufeyson" }],
      meta: { status: "committed", updatedAt: "2026-08-20T12:00:00.000Z", committedAt: "2026-08-20T12:00:00.000Z" }
    },
    {
      encounterId: "enc_b",
      startedAt: "2026-08-22T12:00:00.000Z",
      meta: { status: "committed", updatedAt: "2026-08-22T12:00:00.000Z" }
    }
  ]
}));
var encStats = t.applyImport(encImport, ["encounters"]);
check("import adds new encounter", encStats.added === 1, encStats);
check("import skips exact duplicate encounter", encStats.skipped === 1, encStats);
var afterEnc = JSON.parse(mem["copdocx.store.v1"]);
check(
  "store has both encounters",
  !!afterEnc.encounters.enc_a && !!afterEnc.encounters.enc_b
);

if (fail) {
  process.exit(1);
}
console.log("ok transfer");
