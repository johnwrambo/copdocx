"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const context = {
  window: {},
  console,
  COUNTRIES: [],
  IMMIGRATION_DISPOSITIONS: []
};
context.globalThis = context;
context.window = context;
context.COPDoc = {
  model: {
    isCommitted: lead => !!(lead && lead.meta && lead.meta.status === "committed"),
    subjectOf: lead => lead && lead.person
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

const lead = {
  leadId: "lead_report_integrity",
  meta: { status: "committed" },
  person: {
    personId: "person_report_integrity",
    name: { firstName: "JOIN", lastName: "INTEGRITY" },
    criminal: {},
    immigration: {
      baseballCards: [
        {
          cardId: "card_wrong_person",
          subjectId: "sub_report_exact",
          bookinRecordId: "booking_report_exact",
          personId: "person_other",
          encounterId: "enc_report_exact",
          generatedAt: "2026-09-05T12:00:00.000Z"
        },
        {
          cardId: "card_wrong_booking_alias",
          subjectId: "sub_report_alias",
          bookingId: "booking_other",
          bookinRecordId: "booking_report_alias",
          personId: "person_report_integrity",
          encounterId: "enc_report_alias",
          generatedAt: "2026-09-05T13:00:00.000Z"
        }
      ]
    },
    arrests: [
      {
        arrestId: "arrest_report_exact",
        subjectId: "sub_report_exact",
        bookinRecordId: "booking_report_exact",
        encounterId: "enc_report_exact",
        arrestDate: "2026-09-05"
      },
      {
        arrestId: "arrest_report_duplicate_packet",
        bookinRecordId: "booking_report_duplicate",
        arrestDate: "2026-09-05"
      },
      {
        arrestId: "arrest_report_legacy_number",
        bookinRecordId: "booking_report_legacy_number",
        encounterNumber: "EVENT-42",
        arrestDate: "2026-09-05"
      },
      {
        arrestId: "arrest_report_alias",
        subjectId: "sub_report_alias",
        bookinRecordId: "booking_report_alias",
        encounterId: "enc_report_alias",
        arrestDate: "2026-09-05"
      }
    ]
  }
};

const store = {
  loadFromDisk() {},
  listLeads() {
    return [{ leadId: lead.leadId }];
  },
  getLead(id) {
    return id === lead.leadId ? lead : null;
  },
  bookInPromotionInput(record) {
    return (record && record.sourceInput) || {};
  }
};

const packets = [
  {
    id: "booking_report_exact",
    subjectId: "sub_report_exact",
    personId: "person_other",
    encounterId: "enc_report_exact",
    leadId: lead.leadId,
    sourceInput: { arrestingOfficer: "WRONG PERSON" }
  },
  {
    id: "booking_report_duplicate",
    sourceInput: { arrestingOfficer: "DUPLICATE ONE" }
  },
  {
    id: "booking_report_duplicate",
    sourceInput: { arrestingOfficer: "DUPLICATE TWO" }
  },
  {
    id: "booking_report_legacy_number",
    personId: lead.person.personId,
    leadId: lead.leadId,
    encounterId: "enc_internal_42",
    sourceInput: {
      encounterId: "enc_internal_42",
      encounterNumber: "EVENT-42",
      arrestingOfficer: "VALID LEGACY"
    }
  },
  {
    id: "booking_report_alias",
    bookingId: "booking_other",
    subjectId: "sub_report_alias",
    personId: lead.person.personId,
    leadId: lead.leadId,
    encounterId: "enc_report_alias",
    sourceInput: { arrestingOfficer: "WRONG ALIAS" }
  }
];

const api = context.COPDoc.arrestReport;
const rows = api.collect(store, packets, {});
const byId = id => rows.find(row => row.arrestId === id);

assert.strictEqual(byId("arrest_report_exact").officer, "");
assert.strictEqual(
  byId("arrest_report_exact").card,
  null,
  "a card owned by another Person must not enrich an exact subject"
);
assert.strictEqual(
  byId("arrest_report_duplicate_packet").officer,
  "",
  "duplicate packet IDs must not enrich by last-write-wins"
);
assert.strictEqual(byId("arrest_report_legacy_number").officer, "VALID LEGACY");
assert.strictEqual(byId("arrest_report_legacy_number").encounterId, "enc_internal_42");
assert.strictEqual(
  byId("arrest_report_alias").officer,
  "",
  "internally contradictory packet booking aliases must not enrich"
);
assert.strictEqual(
  byId("arrest_report_alias").card,
  null,
  "internally contradictory card booking aliases must not join"
);

console.log(
  "STAGE2_REPORT_JOIN_INTEGRITY_PASSED owner, duplicate, legacy-number, and booking-alias joins stay isolated."
);
