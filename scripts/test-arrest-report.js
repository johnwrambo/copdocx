"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var context = {
  window: {},
  console: console,
  COUNTRIES: [{ code: "MX", label: "Mexico" }],
  IMMIGRATION_DISPOSITIONS: [
    { code: "REINST", label: "Reinstatement" }
  ]
};
context.globalThis = context;
context.window = context;
context.COPDoc = {
  model: {
    isCommitted: function (lead) {
      return lead && lead.meta && lead.meta.status === "committed";
    },
    subjectOf: function (lead) {
      return lead.person;
    }
  }
};
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(
    path.join(__dirname, "..", "functions", "arrest-report.js"),
    "utf8"
  ),
  context
);

var lead = {
  leadId: "lead_report",
  meta: { status: "committed" },
  person: {
    personId: "person_report",
    name: { firstName: "Ana", lastName: "Garcia" },
    age: "41",
    citizenship: "MX",
    criminal: { fbiNumber: "FBI-100" },
    immigration: {
      alienNumber: "123456789",
      disposition: "REINST",
      baseballCards: [
        {
          cardId: "bbc_report",
          generatedAt: "2026-09-03T13:00:00.000Z",
          bookinRecordId: "book_1",
          arrestDate: "2026-09-03",
          text: "Saved card text\n• No foreign warrants.\n• photo from arrest in the field.",
          photoMediaId: "med_report"
        }
      ]
    },
    arrests: [
      {
        arrestId: "arr_1",
        bookinRecordId: "book_1",
        arrestDate: "2026-09-03",
        arrestTime: "09:15",
        arrestDateTime: "2026-09-03T09:15",
        iceEventNumber: "DAL-100",
        encounterNumber: "ENC-1",
        arrestingOfficer: "M. Reyes",
        team: "DAL - 3 / Street"
      },
      {
        arrestId: "arr_2",
        bookinRecordId: "book_2",
        arrestDate: "2026-09-02",
        arrestDateTime: "2026-09-02T18:00",
        iceEventNumber: "DAL-099",
        encounterNumber: "ENC-2"
      },
      {
        arrestId: "arr_historical",
        arrestDate: "2020-01-01",
        arrestCharge: "Historical lead-entered arrest"
      }
    ]
  }
};
var store = {
  loadFromDisk: function () {},
  listLeads: function () {
    return [{ leadId: lead.leadId }];
  },
  getLead: function (id) {
    return id === lead.leadId ? lead : null;
  },
  bookInPromotionInput: function (record) {
    return record && record.sourceInput ? record.sourceInput : {};
  }
};

var fail = 0;
function check(label, ok, extra) {
  if (!ok) {
    fail += 1;
    console.log("FAIL", label, extra || "");
  } else {
    console.log("ok", label);
  }
}

var api = context.COPDoc.arrestReport;
var rows = api.collect(
  store,
  [
    { id: "book_1", sourceInput: {} },
    { id: "book_2", sourceInput: {} }
  ],
  {}
);
check("report collects every canonical arrest on the case", rows.length === 3, rows);
check(
  "report includes arrests with no Book-In packet",
  rows.some(function (row) { return row.arrestId === "arr_historical"; })
);
check(
  "report joins card to its canonical arrest",
  rows[0].arrestId === "arr_1" && rows[0].card.cardId === "bbc_report"
);
check(
  "report maps case identity fields",
  rows[0].country === "Mexico" &&
    rows[0].aNumber === "A123 456 789" &&
    rows[0].fbiNumber === "FBI-100" &&
    rows[0].disposition === "Reinstatement"
);
var selected = api.collect(
  store,
  [{ id: "book_1" }, { id: "book_2" }],
  { bookinRecordIds: ["book_2"] }
);
check(
  "report selection filters by Book-In provenance",
  selected.length === 1 && selected[0].arrestId === "arr_2"
);
var enrichLead = JSON.parse(JSON.stringify(lead));
enrichLead.person.arrests.push({
  arrestId: "arr_packet_only",
  bookinRecordId: "book_3",
  arrestDate: "2026-09-01"
});
var enrichStore = {
  loadFromDisk: function () {},
  listLeads: function () {
    return [{ leadId: enrichLead.leadId }];
  },
  getLead: function (id) {
    return id === enrichLead.leadId ? enrichLead : null;
  },
  bookInPromotionInput: store.bookInPromotionInput
};
var packetRows = api.collect(
  enrichStore,
  [
    {
      id: "book_3",
      sourceInput: {
        iceEventNumber: "PKT-ICE",
        encounterNumber: "PKT-ENC",
        encounterId: "enc_pkt",
        arrestingOfficer: "P. Officer",
        team: "DAL-3"
      }
    }
  ],
  {}
);
var packetRow = packetRows.filter(function (row) {
  return row.arrestId === "arr_packet_only";
})[0];
check(
  "packet fills blank ICE, encounter, officer, and team",
  packetRow &&
    packetRow.iceEvent === "PKT-ICE" &&
    packetRow.encounterNumber === "PKT-ENC" &&
    packetRow.encounterId === "enc_pkt" &&
    packetRow.officer === "P. Officer" &&
    packetRow.team === "DAL-3"
);
check(
  "arrest ICE wins over packet",
  packetRows.filter(function (row) {
    return row.arrestId === "arr_1";
  })[0].iceEvent === "DAL-100"
);
check(
  "missing packet still lists the arrest",
  api.collect(store, [], {}).some(function (row) {
    return row.arrestId === "arr_1" && row.iceEvent === "DAL-100";
  })
);
check(
  "encounter filter matches packet encounter id",
  api.collect(
    enrichStore,
    [{ id: "book_3", sourceInput: { encounterId: "enc_pkt", encounterNumber: "PKT-ENC" } }],
    { encounterId: "enc_pkt" }
  ).some(function (row) {
    return row.arrestId === "arr_packet_only";
  })
);
var requestedRole = "";
api.hydratePhotos(rows, {
  blob: function (mediaId, role) {
    requestedRole = role;
    return Promise.resolve({
      mediaId: mediaId,
      role: role,
      dataUrl: "data:image/jpeg;base64,AA=="
    });
  }
}).then(function (hydratedRows) {
  check(
    "report resolves card photo from Media",
    requestedRole === "display" &&
      hydratedRows[0].photoDataUrl === "data:image/jpeg;base64,AA==" &&
      !rows[0].card.photoDataUrl
  );
  var report = api.build(hydratedRows, { title: "Daily Arrests" });
  check(
    "email report includes arrest table and saved card",
    report.arrestCount === 3 &&
      report.cardCount === 1 &&
      report.missingCardCount === 2 &&
      report.html.indexOf("Daily Arrests") !== -1 &&
      report.html.indexOf("arrest-card") !== -1 &&
      report.html.indexOf("ICE Dallas arrest information card") !== -1 &&
      report.html.indexOf("data:image/jpeg;base64,AA==") !== -1 &&
      report.plainText.indexOf("Saved card text") !== -1
  );
  var today = api.build(hydratedRows.slice(0, 1), { mode: "today" });
  check(
    "today headline matches Alien daily report",
    today.title === "DAL-3 Arrested 1 alien today in 1 encounter." &&
      today.html.indexOf(today.title) !== -1
  );
  var selectedReport = api.build(hydratedRows, { mode: "selected" });
  check(
    "selected headline and date summary",
    selectedReport.title ===
      "DAL-3 Selected Arrest Report: 3 aliens in 2 encounters." &&
      selectedReport.summary.indexOf("January 1, 2020") !== -1 &&
      selectedReport.summary.indexOf("through") !== -1
  );
  var slim = api.build(hydratedRows.slice(0, 1), {
    mode: "selected",
    columns: [{ id: "name", label: "Subject" }, { id: "iceEvent", label: "ICE Event" }]
  });
  check(
    "report table uses only visible columns",
    slim.html.indexOf(">Subject<") !== -1 &&
      slim.html.indexOf(">ICE Event<") !== -1 &&
      slim.html.indexOf(">A-Number<") === -1 &&
      slim.html.indexOf(">Disposition<") === -1 &&
      slim.html.indexOf("DAL-100") !== -1
  );

  if (fail) {
    process.exit(1);
  }
  console.log("all passed");
}).catch(function (error) {
  console.error(error);
  process.exit(1);
});
