"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var mem = {};
var sessionMem = {};
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
    },
    removeItem: function (k) { delete mem[k]; }
  },
  sessionStorage: {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(sessionMem, k) ? sessionMem[k] : null; },
    setItem: function (k, v) { sessionMem[k] = String(v); },
    removeItem: function (k) { delete sessionMem[k]; }
  }
};
context.globalThis = context;
context.window = context;
vm.createContext(context);
["workspace-config", "baseball-card-contract", "import-schema", "import-workflow"].forEach(function (name) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "functions/" + name + ".js"), "utf8"), context);
});
["util", "lead", "person", "encounter", "location", "vehicle", "link", "store"].forEach(function (name) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "functions/model/" + name + ".js"), "utf8"), context);
});
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

var unversionedBook = JSON.stringify({
  format: "alien-book-in-records",
  records: [{ id: "bk_9", lastName: "X" }]
});
try {
  t.parseTransfer(unversionedBook);
  check("unversioned book-in requires explicit legacy selection", false);
} catch (error) {
  check("unversioned book-in requires explicit legacy selection", /no schemaVersion/.test(error.message));
}
var fromBook = t.parseTransfer(unversionedBook, { allowUnversionedLegacy: true });
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
check("corrupt store import reports error", /damaged|JSON/.test(badLeadStats.error || ""));
check(
  "corrupt store is not overwritten by import",
  mem["copdocx.store.v1"] === "{not json"
);
mem["copdocx.store.v1"] = leadBackup;

var promotedBookinCalls = 0;
var originalPromoteBookInRecords = context.COPDoc.model.store.promoteBookInRecords;
context.COPDoc.model.store.promoteBookInRecords = function (rows, options) {
  promotedBookinCalls += 1;
  return originalPromoteBookInRecords(rows, options);
};
var bookinSchema3 = t.parseTransfer(
  JSON.stringify({
    format: "alien-book-in-records",
    schemaVersion: 3,
    appVersion: "1.10.0",
    records: [
      {
        id: "bk_schema3",
        firstName: "MARTA",
        lastName: "SILVA",
        updatedAt: "2026-09-03T10:00:00.000Z",
        formState: {
          first_name: { type: "text", value: "MARTA", checked: false },
          last_name: { type: "text", value: "SILVA", checked: false }
        }
      }
    ]
  })
);
var bookinStats = t.applyImport(bookinSchema3, ["bookin"]);
var linkedBookin = JSON.parse(mem["alien-book-in.saved-records.v1"]).filter(
  function (row) { return row.id === "bk_schema3"; }
)[0];
var linkedWorkspace = JSON.parse(mem["copdocx.store.v1"]);
var linkedPerson = linkedBookin && linkedWorkspace.people[linkedBookin.personId];
var linkedLead = linkedBookin && linkedWorkspace.leads[linkedBookin.leadId];
var linkedArrest = linkedPerson && (linkedPerson.arrests || []).filter(function (row) {
  return row.arrestId === linkedBookin.arrestId && row.bookinRecordId === linkedBookin.id;
})[0];
check(
  "book-in import promotes packets to canonical cases",
  promotedBookinCalls === 1 &&
    bookinStats.bookinPromotionAttempted &&
    bookinStats.casesCreated >= 1 &&
    !!linkedArrest &&
    !!linkedLead &&
    linkedLead.subjectPersonId === linkedPerson.personId &&
    linkedLead.person.personId === linkedPerson.personId,
  bookinStats
);
var repeatBookinStats = t.applyImport(bookinSchema3, ["bookin"]);
var repeatedBookin = JSON.parse(mem["alien-book-in.saved-records.v1"]).filter(
  function (row) { return row.id === "bk_schema3"; }
)[0];
check(
  "book-in reimport preserves canonical links",
  repeatBookinStats.skipped >= 1 &&
    repeatedBookin.leadId === linkedBookin.leadId &&
    repeatedBookin.personId === linkedBookin.personId &&
    repeatedBookin.arrestId === linkedBookin.arrestId,
  repeatBookinStats
);
context.COPDoc.model.store.promoteBookInRecords = originalPromoteBookInRecords;

function testImportPopupOpensCompact() {
  var opened = null;
  var resized = null;
  var doc = {
    readyState: "complete",
    body: {
      dataset: {},
      getAttribute: function () {
        return "home";
      }
    },
    head: { appendChild: function () {} },
    getElementById: function () {
      return null;
    },
    querySelector: function () {
      return null;
    },
    querySelectorAll: function () {
      return [];
    },
    addEventListener: function () {}
  };
  var sandbox = {
    window: {},
    document: doc,
    console: console,
    Date: Date,
    JSON: JSON,
    Array: Array,
    Object: Object,
    Promise: Promise,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    addEventListener: function () {},
    screen: { availWidth: 1920, availHeight: 1080 },
    location: { href: "http://localhost/home.html" },
    URL: URL,
    localStorage: {
      getItem: function () {
        return null;
      },
      setItem: function () {}
    },
    open: function (url, name, features) {
      opened = { url: url, name: name, features: String(features || "") };
      return {
        closed: false,
        resizeTo: function (width, height) {
          resized = [width, height];
        },
        moveTo: function () {},
        focus: function () {}
      };
    }
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  ["workspace-config", "baseball-card-contract", "import-schema", "import-workflow"].forEach(function (name) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "functions/" + name + ".js"), "utf8"), sandbox);
  });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "..", "functions/transfer.js"), "utf8"),
    sandbox
  );
  sandbox.openFileImport();
  check("import popup opens", !!(opened && opened.name === "copdoc-import"));
  check(
    "import popup starts compact",
    !!(
      opened &&
      /width=480/.test(opened.features) &&
      /height=280/.test(opened.features)
    ),
    opened && opened.features
  );
  check(
    "import popup resize stays compact",
    !!(resized && resized[0] === 480 && resized[1] === 280),
    resized
  );
}

testImportPopupOpensCompact();

function testLoadModelScriptReady() {
  var hung = false;
  var existing = {
    dataset: {},
    addEventListener: function () {
      hung = true;
    }
  };
  var created = [];
  var doc = {
    readyState: "complete",
    body: {
      dataset: {},
      getAttribute: function () {
        return "import";
      }
    },
    head: {
      appendChild: function (el) {
        created.push(el && el.src);
      }
    },
    getElementById: function () {
      return null;
    },
    querySelector: function (sel) {
      if (String(sel).indexOf("functions/model/util.js") !== -1) {
        return existing;
      }
      return null;
    },
    querySelectorAll: function () {
      return [];
    },
    addEventListener: function () {}
  };
  var sandbox = {
    window: {},
    document: doc,
    console: console,
    Date: Date,
    JSON: JSON,
    Array: Array,
    Object: Object,
    Promise: Promise,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    localStorage: {
      getItem: function () {
        return null;
      },
      setItem: function () {}
    }
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  ["workspace-config", "baseball-card-contract", "import-schema", "import-workflow"].forEach(function (name) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "functions/" + name + ".js"), "utf8"), sandbox);
  });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "..", "functions/transfer.js"), "utf8"),
    sandbox
  );
  return sandbox.COPDoc.transfer
    .loadModelScript("functions/model/util.js")
    .then(function () {
      check("already-loaded util.js does not wait on load", !hung);
    });
}

var demoPath = path.join(__dirname, "..", "COPDoc_demo.json");
if (fs.existsSync(demoPath)) {
  var demoParsed = t.parseTransfer(fs.readFileSync(demoPath, "utf8"));
  check("demo json parses", demoParsed.format === "copdocx.transfer.v1");
  check(
    "demo json has the briefing types",
    demoParsed.leads.length >= 12 &&
      demoParsed.officers.length >= 10 &&
      demoParsed.vehicles.length >= 4 &&
      demoParsed.shifts.length >= 8 &&
      demoParsed.bookin.length >= 4,
    {
      leads: demoParsed.leads.length,
      officers: demoParsed.officers.length,
      vehicles: demoParsed.vehicles.length,
      shifts: demoParsed.shifts.length,
      bookin: demoParsed.bookin.length
    }
  );
  var demoStats = t.applyImport(demoParsed, [
    "leads",
    "officers",
    "vehicles",
    "shifts",
    "bookin"
  ]);
  check(
    "demo json import writes new records",
    demoStats.added >= 12 && !demoStats.error,
    demoStats
  );
}

var hangTimer = setTimeout(function () {
  console.log("FAIL already-loaded util.js hung waiting on load");
  process.exit(1);
}, 2000);

testLoadModelScriptReady()
  .then(function () {
    clearTimeout(hangTimer);
    if (fail) {
      process.exit(1);
    }
    console.log("ok transfer");
  })
  .catch(function (error) {
    clearTimeout(hangTimer);
    console.log("FAIL loadModelScript", error && error.message ? error.message : error);
    process.exit(1);
  });
