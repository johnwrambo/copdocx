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

var demo = t.parseTransfer(JSON.stringify({
  format: "copdocx-demo-import",
  schema: "copdocx.import.v1",
  admin: {
    officers: [
      {
        id: "ofc_demo",
        officerId: "ofc_demo",
        lastName: "DEMO",
        firstName: "One",
        meta: { status: "committed" }
      }
    ]
  },
  leads: {
    lead_demo: {
      leadId: "lead_demo",
      person: { personId: "p_demo" },
      meta: { status: "committed" }
    }
  }
}));
check("demo import officers", demo.officers.length === 1 && demo.officers[0].officerId === "ofc_demo");
check("demo import leads object", demo.leads.length === 1 && demo.leads[0].leadId === "lead_demo");

var snap = t.parseTransfer(JSON.stringify({
  schema: "copdocx.lead.v1",
  leadId: "lead_snap",
  person: { personId: "p_snap", name: { lastName: "SNAP" } },
  meta: { status: "committed" }
}));
check("single-lead snapshot", snap.leads.length === 1 && snap.leads[0].leadId === "lead_snap");

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
incoming.officers[0].meta.updatedAt = "2026-08-12T00:00:00.000Z";
var stats2 = t.applyImport(incoming, ["officers"]);
check("import replaces different same id", stats2.updated === 1, stats2);

incoming.officers[0].role = "OLD";
incoming.officers[0].meta.updatedAt = "2026-08-01T00:00:00.000Z";
var statsOld = t.applyImport(incoming, ["officers"]);
check("import keeps newer local record", statsOld.updated === 0 && statsOld.skipped >= 1, statsOld);
var afterOld = JSON.parse(mem["copdoc.admin.v1"]);
check(
  "older import did not overwrite",
  afterOld.officers.filter(function (row) { return row.id === "ofc_1"; })[0].role === "IO"
);

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

var originalSet = context.localStorage.setItem;
context.localStorage.setItem = function () {
  throw new Error("quota");
};
var quotaIn = t.parseTransfer(
  JSON.stringify({
    format: "copdocx.transfer.v1",
    officers: [
      {
        id: "ofc_quota",
        officerId: "ofc_quota",
        lastName: "QUOTA",
        firstName: "Fail",
        meta: { status: "committed", updatedAt: "2026-08-12T00:00:00.000Z" }
      }
    ]
  })
);
var quotaStats = t.applyImport(quotaIn, ["officers"]);
check("failed write is not counted as added", quotaStats.added === 0, quotaStats);
check("failed write reports error", !!quotaStats.error, quotaStats);
var afterQuota = JSON.parse(mem["copdoc.admin.v1"]);
check(
  "failed write leaves admin officers unchanged",
  afterQuota.officers.every(function (row) {
    return row.id !== "ofc_quota";
  })
);
context.localStorage.setItem = originalSet;

var leadBackup = mem["copdocx.store.v1"];
mem["copdocx.store.v1"] = "{not json";
var badLeadIn = t.parseTransfer(
  JSON.stringify({
    format: "copdocx.transfer.v1",
    leads: [
      {
        leadId: "lead_inject",
        person: { personId: "p_inject" },
        meta: { status: "committed" }
      }
    ]
  })
);
var badLeadStats = t.applyImport(badLeadIn, ["leads"]);
check("corrupt store import is not counted", badLeadStats.added === 0, badLeadStats);
check("corrupt store import reports error", /damaged/.test(badLeadStats.error || ""));
check(
  "corrupt store is not overwritten by import",
  mem["copdocx.store.v1"] === "{not json"
);
mem["copdocx.store.v1"] = leadBackup;

if (fail) {
  process.exit(1);
}
console.log("ok transfer");
