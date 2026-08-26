"use strict";

var assert = require("assert").strict;
var rapSheet = require("../functions/rapsheet.js");

var tests = [];

function test(name, fn) {
  tests.push({ name: name, fn: fn });
}

function deterministicOptions() {
  var id = 0;
  return {
    now: "2026-08-25T12:00:00.000Z",
    idFactory: function (prefix) {
      id += 1;
      return prefix + "-merge-" + id;
    }
  };
}

function collectFacts(value, output, seen) {
  if (!value || typeof value !== "object") {
    return;
  }
  if (value.factId) {
    if (!seen[value.factId]) {
      seen[value.factId] = true;
      output.push(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(function (entry) {
      collectFacts(entry, output, seen);
    });
    return;
  }
  Object.keys(value).forEach(function (key) {
    if (key !== "summary" && key !== "auditTrail") {
      collectFacts(value[key], output, seen);
    }
  });
}

function reviewAll(result) {
  var facts = [];
  collectFacts(result, facts, {});
  facts.forEach(function (fact) {
    fact.reviewStatus = "accepted";
    fact.verified = true;
  });
  (result.unparsedSections || []).forEach(function (section) {
    section.reviewStatus = "accepted";
  });
  (result.cycles || []).forEach(function (cycle) {
    (cycle.sentences || []).forEach(function (sentence) {
      if (sentence.dispositionId) {
        sentence.linkReviewStatus = "accepted";
        sentence.linkVerified = true;
      }
    });
  });
  result.reviewStatus = "reviewed";
  result.summary = rapSheet.generateRapSheetSummary(result);
  return result;
}

function comprehensiveImport() {
  return reviewAll(
    rapSheet.parseRapSheetText(
      [
        "TEXAS CRIMINAL HISTORY",
        "NAM/DOE, JANE A DOB/19800102 FBI/001234567 SID/TX0000456 DL/00007890 SEX/F RAC/W HGT/505",
        "AKA/SMITH, JANE",
        "ARREST CYCLE 1",
        "ARREST DATE: 01/02/2020",
        "ARREST AGENCY: FICTIONAL POLICE DEPARTMENT",
        "ARREST CHARGE: THEFT",
        "STATUTE: 31.03",
        "CLASS: CLASS B MISDEMEANOR",
        "DISPOSITION: DISMISSED 04/05/2020",
        "ARREST CYCLE 2",
        "ARREST DATE: 06/07/2021",
        "ARREST AGENCY: SAMPLE POLICE DEPARTMENT",
        "ARREST LOCATION: SAMPLE, TX",
        "ARREST CHARGE: AGGRAVATED ASSAULT",
        "STATUTE: 22.02",
        "CLASS: SECOND DEGREE FELONY",
        "COURT: SAMPLE DISTRICT COURT",
        "DOCKET: F-21-0001",
        "COURT CHARGE: ASSAULT CAUSES BODILY INJURY",
        "STATUTE: 22.01",
        "CLASS: CLASS A MISDEMEANOR",
        "DISPOSITION: CONVICTED 02/03/2022",
        "SENTENCE: 12 MONTHS"
      ].join("\n"),
      deterministicOptions()
    )
  );
}

function emptySnapshot() {
  return {
    mainName: { first: "", middle: "", last: "" },
    dateOfBirth: "",
    sex: "",
    fbiNumber: "",
    stateId: "",
    aliases: [],
    documents: [],
    arrests: [],
    convictions: []
  };
}

function FakeControl(doc, value) {
  this.ownerDocument = doc;
  this.value = value || "";
  this.checked = false;
  this.events = [];
}

FakeControl.prototype.dispatchEvent = function (event) {
  this.events.push(event.type);
  return true;
};

function FakeCard(doc, fields) {
  this.ownerDocument = doc;
  this.tagName = "FIELDSET";
  this.attributes = {};
  this.fields = {};
  (fields || []).forEach(function (field) {
    this.fields[field] = new FakeControl(doc, "");
  }, this);
}

FakeCard.prototype.querySelector = function (selector) {
  var match = String(selector).match(/^\[data-field="([^"]+)"\]$/);
  return match ? this.fields[match[1]] || null : null;
};

FakeCard.prototype.setAttribute = function (name, value) {
  this.attributes[name] = String(value);
};

FakeCard.prototype.getAttribute = function (name) {
  return Object.prototype.hasOwnProperty.call(this.attributes, name)
    ? this.attributes[name]
    : null;
};

function FakeDocument() {
  this.byId = {};
}

FakeDocument.prototype.getElementById = function (id) {
  return this.byId[id] || null;
};

FakeDocument.prototype.createEvent = function () {
  return {
    type: "",
    initEvent: function (type) {
      this.type = type;
    }
  };
};

function addControl(doc, id, value) {
  var control = new FakeControl(doc, value);
  doc.byId[id] = control;
  return control;
}

function addList(doc, id) {
  var list = { children: [] };
  doc.byId[id] = list;
  return list;
}

var CARD_FIELDS = {
  alias: ["firstName", "middleName", "lastName"],
  document: [
    "documentType",
    "documentNumber",
    "issuingState",
    "issuingCountry",
    "documentIssueDate",
    "documentExpiration"
  ],
  arrest: [
    "arrestDate",
    "arrestCharge",
    "arrestStatute",
    "arrestClass",
    "arrestAgency",
    "arrestAgencyCode",
    "arrestLocation"
  ],
  conviction: [
    "crime",
    "convictionStatute",
    "convictionClass",
    "disposition",
    "convictionDate",
    "dispositionDate",
    "court",
    "docketNumber",
    "sentence"
  ]
};

var LIST_IDS = {
  alias: "aliasList",
  document: "documentList",
  arrest: "arrestList",
  conviction: "convictionList"
};

function createForm() {
  var doc = new FakeDocument();
  [
    "firstName",
    "middleName",
    "lastName",
    "dateOfBirth",
    "fbiNumber",
    "stateId"
  ].forEach(function (id) {
    addControl(doc, id, "");
  });
  addControl(doc, "sexMale", "male");
  addControl(doc, "sexFemale", "female");
  addControl(doc, "isCriminal", "");

  Object.keys(LIST_IDS).forEach(function (type) {
    var list = addList(doc, LIST_IDS[type]);
    if (type !== "alias") {
      list.children.push(new FakeCard(doc, CARD_FIELDS[type]));
    }
  });

  return {
    document: doc,
    createCard: function (type) {
      var card = new FakeCard(doc, CARD_FIELDS[type]);
      doc.byId[LIST_IDS[type]].children.push(card);
      return card;
    }
  };
}

function field(card, name) {
  return card.fields[name].value;
}

test("a merge is blocked until the import is fully reviewed", function () {
  var result = rapSheet.parseRapSheetText("NAM/DOE, JANE", deterministicOptions());
  var plan = rapSheet.buildRapSheetMergePlan(result, emptySnapshot());
  assert.equal(plan.blockedReason, "import_not_fully_reviewed");
  assert.equal(plan.scalarWrites.length, 0);
});

test("accepted facts map only to compatible existing field types", function () {
  var plan = rapSheet.buildRapSheetMergePlan(
    comprehensiveImport(),
    emptySnapshot()
  );

  assert.equal(plan.blockedReason, null);
  assert.ok(plan.scalarWrites.some(function (write) { return write.kind === "name"; }));
  assert.ok(plan.scalarWrites.some(function (write) { return write.targetId === "dateOfBirth"; }));
  assert.ok(plan.scalarWrites.some(function (write) { return write.targetId === "fbiNumber"; }));
  assert.ok(plan.scalarWrites.some(function (write) { return write.targetId === "stateId"; }));
  assert.equal(plan.sexWrite.value, "female");
  assert.equal(plan.aliases.length, 1);
  assert.equal(plan.documents.length, 1);
  assert.equal(plan.arrests.length, 2);
  assert.equal(plan.convictions.length, 1);
  assert.equal(plan.convictions[0].values.disposition, "CONVICTED 02/03/2022");
  assert.equal(plan.convictions[0].values.convictionDate, "2022-02-03");
  assert.equal(plan.convictions[0].values.sentence, "12 MONTHS");
  assert.equal(plan.setCriminal, true);
  assert.ok(plan.unmapped.some(function (entry) {
    return entry.field === "subjectCandidate.descriptors.race";
  }));
});

test("equivalent biography is skipped and identifiers preserve leading zeros", function () {
  var snapshot = emptySnapshot();
  snapshot.mainName = { first: "Jane", middle: "A.", last: "Doe" };
  snapshot.dateOfBirth = "1980-01-02";
  snapshot.sex = "female";
  snapshot.fbiNumber = "001-234-567";
  snapshot.stateId = "TX-0000456";
  snapshot.aliases = [
    { firstName: "JANE", middleName: "", lastName: "SMITH" }
  ];
  snapshot.documents = [
    { documentType: "DRIVERS_LICENSE", documentNumber: "00007890" }
  ];

  var plan = rapSheet.buildRapSheetMergePlan(comprehensiveImport(), snapshot);
  assert.equal(plan.aliases.length, 0);
  assert.equal(plan.documents.length, 0);
  assert.equal(plan.scalarWrites.filter(function (write) {
    return write.kind === "name" ||
      write.targetId === "dateOfBirth" ||
      write.targetId === "fbiNumber" ||
      write.targetId === "stateId";
  }).length, 0);
  assert.ok(plan.skipped.length >= 6);
});

test("an explicitly alternate DOB never becomes the primary DOB", function () {
  var result = reviewAll(
    rapSheet.parseRapSheetText(
      "ALTERNATE DOB: 02/03/1980",
      deterministicOptions()
    )
  );
  assert.equal(result.subjectCandidate.datesOfBirth[0].dateType, "alternate");
  var blankPlan = rapSheet.buildRapSheetMergePlan(result, emptySnapshot());
  assert.equal(blankPlan.scalarWrites.some(function (write) {
    return write.targetId === "dateOfBirth";
  }), false);
  assert.ok(blankPlan.conflicts.some(function (entry) {
    return entry.reason === "alternate_date_of_birth_field_missing";
  }));

  var matchingSnapshot = emptySnapshot();
  matchingSnapshot.dateOfBirth = "1980-02-03";
  var matchingPlan = rapSheet.buildRapSheetMergePlan(result, matchingSnapshot);
  assert.ok(matchingPlan.skipped.some(function (entry) {
    return entry.reason === "alternate_dob_matches_primary_value";
  }));
});

test("primary DOBs are compared before alternates regardless of source order", function () {
  var result = reviewAll(
    rapSheet.parseRapSheetText(
      "ALTERNATE DOB: 02/03/1980\nDOB: 02/03/1980",
      deterministicOptions()
    )
  );
  var plan = rapSheet.buildRapSheetMergePlan(result, emptySnapshot());
  assert.ok(plan.scalarWrites.some(function (write) {
    return write.targetId === "dateOfBirth" && write.value === "1980-02-03";
  }));
  assert.equal(plan.conflicts.some(function (entry) {
    return entry.reason === "alternate_date_of_birth_field_missing";
  }), false);
  assert.ok(plan.skipped.some(function (entry) {
    return entry.reason === "alternate_dob_matches_primary_value";
  }));
});

test("a conflicting primary name becomes an alias while other bio conflicts are preserved", function () {
  var snapshot = emptySnapshot();
  snapshot.mainName = { first: "John", middle: "Q", last: "Public" };
  snapshot.dateOfBirth = "1970-01-01";
  snapshot.sex = "male";
  snapshot.fbiNumber = "DIFFERENT-FBI";
  snapshot.stateId = "DIFFERENT-SID";

  var plan = rapSheet.buildRapSheetMergePlan(comprehensiveImport(), snapshot);
  assert.equal(plan.aliases.length, 2);
  assert.ok(plan.aliases.some(function (entry) {
    return entry.values.firstName === "JANE" && entry.values.lastName === "DOE";
  }));
  assert.ok(plan.conflicts.some(function (entry) {
    return entry.target === "dateOfBirth" &&
      entry.reason === "alternate_date_of_birth_field_missing";
  }));
  assert.ok(plan.conflicts.some(function (entry) {
    return entry.target === "sex" && entry.reason === "alternate_sex_field_missing";
  }));
  assert.ok(plan.conflicts.some(function (entry) {
    return entry.target === "fbiNumber";
  }));
  assert.ok(plan.conflicts.some(function (entry) {
    return entry.target === "stateId";
  }));
});

test("applying a plan fills existing controls and repeatable cards idempotently", function () {
  var form = createForm();
  var result = comprehensiveImport();
  var first = rapSheet.mergeRapSheetImportIntoForm(result, {
    document: form.document,
    createCard: form.createCard
  });

  assert.equal(first.report.blockedReason, null);
  assert.equal(form.document.getElementById("firstName").value, "JANE");
  assert.equal(form.document.getElementById("middleName").value, "A");
  assert.equal(form.document.getElementById("lastName").value, "DOE");
  assert.equal(form.document.getElementById("dateOfBirth").value, "1980-01-02");
  assert.equal(form.document.getElementById("fbiNumber").value, "001234567");
  assert.equal(form.document.getElementById("stateId").value, "TX0000456");
  assert.equal(form.document.getElementById("sexFemale").checked, true);
  assert.equal(form.document.getElementById("isCriminal").checked, true);

  var aliasCards = form.document.getElementById("aliasList").children;
  var documentCards = form.document.getElementById("documentList").children;
  var arrestCards = form.document.getElementById("arrestList").children;
  var convictionCards = form.document.getElementById("convictionList").children;
  assert.equal(aliasCards.length, 1);
  assert.equal(field(aliasCards[0], "lastName"), "SMITH");
  assert.equal(documentCards.length, 1);
  assert.equal(field(documentCards[0], "documentType"), "DRIVERS_LICENSE");
  assert.equal(field(documentCards[0], "documentNumber"), "00007890");
  assert.equal(arrestCards.length, 2);
  assert.equal(convictionCards.length, 1);
  assert.equal(field(convictionCards[0], "crime"), "ASSAULT CAUSES BODILY INJURY");
  assert.equal(field(convictionCards[0], "sentence"), "12 MONTHS");

  var counts = {
    alias: aliasCards.length,
    document: documentCards.length,
    arrest: arrestCards.length,
    conviction: convictionCards.length
  };
  var second = rapSheet.mergeRapSheetImportIntoForm(result, {
    document: form.document,
    createCard: form.createCard
  });
  assert.equal(second.report.applied.length, 0);
  assert.equal(form.document.getElementById("aliasList").children.length, counts.alias);
  assert.equal(form.document.getElementById("documentList").children.length, counts.document);
  assert.equal(form.document.getElementById("arrestList").children.length, counts.arrest);
  assert.equal(form.document.getElementById("convictionList").children.length, counts.conviction);
});

test("dismissals and guilty pleas never create conviction cards or set Criminal", function () {
  var result = reviewAll(
    rapSheet.parseRapSheetText(
      [
        "ARREST CYCLE 1",
        "ARREST CHARGE: THEFT",
        "DISPOSITION: DISMISSED",
        "ARREST CYCLE 2",
        "ARREST CHARGE: TRESPASS",
        "DISPOSITION: PLEA: GUILTY",
        "SENTENCE: 12 MONTHS"
      ].join("\n"),
      deterministicOptions()
    )
  );
  var plan = rapSheet.buildRapSheetMergePlan(result, emptySnapshot());
  assert.equal(plan.convictions.length, 0);
  assert.equal(plan.setCriminal, false);
  assert.equal(plan.unmapped.filter(function (entry) {
    return entry.reason === "non_conviction_case_destination_missing";
  }).length >= 2, true);
});

test("a corrected or rejected disposition outcome cannot create a conviction", function () {
  var corrected = reviewAll(
    rapSheet.parseRapSheetText(
      "ARREST CYCLE 1\nARREST CHARGE: THEFT\nDISPOSITION: CONVICTED",
      deterministicOptions()
    )
  );
  corrected.cycles[0].dispositions[0].outcome.correctedValue = "Dismissed";
  var correctedPlan = rapSheet.buildRapSheetMergePlan(
    corrected,
    emptySnapshot()
  );
  assert.equal(correctedPlan.convictions.length, 0);
  assert.equal(correctedPlan.setCriminal, false);

  var rejected = reviewAll(
    rapSheet.parseRapSheetText(
      "ARREST CYCLE 1\nARREST CHARGE: THEFT\nDISPOSITION: CONVICTED",
      deterministicOptions()
    )
  );
  rejected.cycles[0].dispositions[0].outcome.reviewStatus = "rejected";
  var rejectedPlan = rapSheet.buildRapSheetMergePlan(rejected, emptySnapshot());
  assert.equal(rejectedPlan.convictions.length, 0);
  assert.equal(rejectedPlan.setCriminal, false);
});

test("sentence text is not attached unless its disposition link is accepted", function () {
  var result = reviewAll(
    rapSheet.parseRapSheetText(
      [
        "ARREST CYCLE 1",
        "ARREST CHARGE: THEFT",
        "DISPOSITION: CONVICTED",
        "SENTENCE: 12 MONTHS"
      ].join("\n"),
      deterministicOptions()
    )
  );
  result.cycles[0].sentences[0].linkReviewStatus = "rejected";
  result.cycles[0].sentences[0].linkVerified = false;
  var plan = rapSheet.buildRapSheetMergePlan(result, emptySnapshot());
  assert.equal(plan.convictions.length, 1);
  assert.equal(plan.convictions[0].values.sentence, "");
  assert.ok(plan.unmapped.some(function (entry) {
    return entry.reason === "sentence_relationship_not_accepted";
  }));
});

test("an ambiguous conviction-to-charge link remains unmapped", function () {
  var result = reviewAll(
    rapSheet.parseRapSheetText(
      [
        "ARREST CYCLE 1",
        "ARREST CHARGE: THEFT",
        "ARREST CHARGE: TRESPASS",
        "DISPOSITION: CONVICTED"
      ].join("\n"),
      deterministicOptions()
    )
  );
  assert.equal(result.cycles[0].dispositions[0].chargeId, null);
  assert.ok(result.cycles[0].dispositions[0].possibleChargeId);
  var plan = rapSheet.buildRapSheetMergePlan(result, emptySnapshot());
  assert.equal(plan.convictions.length, 0);
  assert.equal(plan.setCriminal, false);
  assert.ok(plan.unmapped.some(function (entry) {
    return entry.reason === "ambiguous_or_missing_conviction_charge_link";
  }));
});

test("ambiguous accepted dates are preserved as conflicts instead of being written", function () {
  var result = reviewAll(
    rapSheet.parseRapSheetText(
      "ARREST CYCLE 1\nARREST DATE: 01/02/20\nARREST CHARGE: THEFT",
      deterministicOptions()
    )
  );
  var plan = rapSheet.buildRapSheetMergePlan(result, emptySnapshot());
  assert.equal(plan.arrests.length, 1);
  assert.equal(plan.arrests[0].values.arrestDate, "");
  assert.ok(plan.conflicts.some(function (entry) {
    return entry.target === "arrestDate" &&
      entry.reason === "accepted_date_is_not_unambiguous";
  }));
});

test("distinct non-Latin names never collapse during comparison", function () {
  var result = reviewAll(
    rapSheet.parseRapSheetText("NAM/李, 小明", deterministicOptions())
  );
  var snapshot = emptySnapshot();
  snapshot.mainName = { first: "", middle: "", last: "王" };
  var plan = rapSheet.buildRapSheetMergePlan(result, snapshot);
  assert.equal(plan.scalarWrites.filter(function (write) {
    return write.kind === "name";
  }).length, 0);
  assert.equal(plan.aliases.length, 1);
  assert.equal(plan.aliases[0].values.firstName, "小明");
  assert.equal(plan.aliases[0].values.lastName, "李");
});

test("distinct identical-looking history occurrences remain separate and reapply cleanly", function () {
  var result = reviewAll(
    rapSheet.parseRapSheetText(
      [
        "ARREST CYCLE 1",
        "ARREST DATE: 01/01/2020",
        "ARREST CHARGE: THEFT",
        "DISPOSITION: CONVICTED 02/02/2020",
        "ARREST CYCLE 2",
        "ARREST DATE: 01/01/2020",
        "ARREST CHARGE: THEFT",
        "DISPOSITION: CONVICTED 02/02/2020"
      ].join("\n"),
      deterministicOptions()
    )
  );
  var plan = rapSheet.buildRapSheetMergePlan(result, emptySnapshot());
  assert.equal(plan.arrests.length, 2);
  assert.equal(plan.convictions.length, 2);

  var form = createForm();
  rapSheet.mergeRapSheetImportIntoForm(result, {
    document: form.document,
    createCard: form.createCard
  });
  assert.equal(form.document.getElementById("arrestList").children.length, 2);
  assert.equal(form.document.getElementById("convictionList").children.length, 2);
  rapSheet.mergeRapSheetImportIntoForm(result, {
    document: form.document,
    createCard: form.createCard
  });
  assert.equal(form.document.getElementById("arrestList").children.length, 2);
  assert.equal(form.document.getElementById("convictionList").children.length, 2);

  form.document.getElementById("arrestList").children.splice(1, 1);
  form.document.getElementById("convictionList").children.splice(1, 1);
  rapSheet.mergeRapSheetImportIntoForm(result, {
    document: form.document,
    createCard: form.createCard
  });
  assert.equal(form.document.getElementById("arrestList").children.length, 2);
  assert.equal(form.document.getElementById("convictionList").children.length, 2);
});

test("multiple charges in one cycle each receive their own arrest card", function () {
  var result = reviewAll(
    rapSheet.parseRapSheetText(
      [
        "ARREST CYCLE 1",
        "ARREST DATE: 01/01/2020",
        "ARREST CHARGE: THEFT",
        "ARREST CHARGE: TRESPASS"
      ].join("\n"),
      deterministicOptions()
    )
  );
  var plan = rapSheet.buildRapSheetMergePlan(result, emptySnapshot());
  assert.deepEqual(
    plan.arrests.map(function (entry) { return entry.values.arrestCharge; }),
    ["THEFT", "TRESPASS"]
  );

  var repeated = reviewAll(
    rapSheet.parseRapSheetText(
      [
        "ARREST CYCLE 1",
        "ARREST DATE: 01/01/2020",
        "ARREST CHARGE: THEFT",
        "ARREST CHARGE: THEFT"
      ].join("\n"),
      deterministicOptions()
    )
  );
  assert.equal(
    rapSheet.buildRapSheetMergePlan(repeated, emptySnapshot()).arrests.length,
    2
  );
});

test("compatible partial names fill only blanks while rejected facts stay ignored", function () {
  var result = reviewAll(
    rapSheet.parseRapSheetText(
      "NAM/DOE, JANE A FBI/001234567",
      deterministicOptions()
    )
  );
  result.subjectCandidate.identifiers.fbiNumber.reviewStatus = "rejected";
  result.subjectCandidate.identifiers.fbiNumber.verified = false;
  var snapshot = emptySnapshot();
  snapshot.mainName = { first: "Jane", middle: "", last: "" };
  var plan = rapSheet.buildRapSheetMergePlan(result, snapshot);
  var nameWrite = plan.scalarWrites.filter(function (write) {
    return write.kind === "name";
  })[0];
  assert.deepEqual(nameWrite.values, {
    middleName: "A",
    lastName: "DOE"
  });
  assert.equal(plan.aliases.length, 0);
  assert.equal(plan.scalarWrites.some(function (write) {
    return write.targetId === "fbiNumber";
  }), false);
});

test("stale and in-review imports remain blocked", function () {
  ["stale", "in_review"].forEach(function (status) {
    var result = reviewAll(
      rapSheet.parseRapSheetText("NAM/DOE, JANE", deterministicOptions())
    );
    result.reviewStatus = status;
    assert.equal(
      rapSheet.buildRapSheetMergePlan(result, emptySnapshot()).blockedReason,
      "import_not_fully_reviewed"
    );
  });
});

test("a missing conviction-card factory cannot set the Criminal flag", function () {
  var result = reviewAll(
    rapSheet.parseRapSheetText(
      "ARREST CYCLE 1\nARREST CHARGE: THEFT\nDISPOSITION: CONVICTED",
      deterministicOptions()
    )
  );
  var doc = new FakeDocument();
  var criminal = addControl(doc, "isCriminal", "");
  var merged = rapSheet.mergeRapSheetImportIntoForm(result, { document: doc });
  assert.equal(merged.report.cardsApplied.conviction, 0);
  assert.equal(merged.report.criminalFlagSet, false);
  assert.equal(criminal.checked, false);
  assert.ok(merged.report.conflicts.some(function (entry) {
    return entry.reason === "repeatable_card_factory_unavailable";
  }));
});

tests.forEach(function (entry, index) {
  entry.fn();
  process.stdout.write("ok " + (index + 1) + " - " + entry.name + "\n");
});

process.stdout.write("\n" + tests.length + " RAP-sheet merge tests passed.\n");
