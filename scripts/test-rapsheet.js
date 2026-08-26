"use strict";

var assert = require("assert").strict;
var rapSheet = require("../functions/rapsheet.js");

var passed = 0;

function deterministicOptions() {
  var counter = 0;
  return {
    now: "2026-08-25T12:00:00Z",
    idFactory: function (prefix) {
      counter += 1;
      return prefix + "-test-" + counter;
    }
  };
}

function parse(text, extraOptions) {
  var options = deterministicOptions();
  Object.keys(extraOptions || {}).forEach(function (key) {
    options[key] = extraOptions[key];
  });
  return rapSheet.parseRapSheetText(text, options);
}

function warningCodes(result) {
  return result.warnings.map(function (warning) {
    return warning.code;
  });
}

function test(name, fn) {
  fn();
  passed += 1;
  process.stdout.write("ok " + passed + " - " + name + "\n");
}

test("empty input is rejected without inventing a record", function () {
  var result = parse("   \r\n");
  assert.equal(result.reviewStatus, "rejected");
  assert.equal(result.cycles.length, 0);
  assert.ok(warningCodes(result).includes("empty_input"));
});

test("identity fields preserve leading zeros and exact source text", function () {
  var source =
    "TEXAS CRIMINAL HISTORY\r\n" +
    "NAM/DOE, JANE A DOB/19800102 FBI/001234567 SID/TX0000456 DL/00007890 SEX/F RAC/W";
  var result = parse(source);
  var subject = result.subjectCandidate;

  assert.equal(result.source.detectedFormat, "texas-text");
  assert.equal(subject.names[0].value, "DOE, JANE A");
  assert.equal(subject.datesOfBirth[0].normalizedValue, "1980-01-02");
  assert.equal(subject.identifiers.fbiNumber.value, "001234567");
  assert.equal(subject.identifiers.stateIds[0].value, "TX0000456");
  assert.equal(subject.identifiers.driverLicenses[0].value, "00007890");
  assert.equal(subject.identifiers.fbiNumber.sourcePage, null);
  assert.equal(subject.identifiers.fbiNumber.sourceLine.start, 2);
  assert.equal(subject.identifiers.fbiNumber.sourceText, source.split("\r\n")[1]);
  assert.equal(subject.identifiers.fbiNumber.verified, false);
});

test("page-aware parsing records page provenance", function () {
  var result = rapSheet.parseRapSheetPages(
    [
      { pageNumber: 4, text: "TEXAS CRIMINAL HISTORY\nNAM/DOE, JOHN" },
      { pageNumber: 5, text: "ARREST CYCLE 1\fARREST DATE: 06/14/2024" }
    ],
    deterministicOptions()
  );

  assert.equal(result.subjectCandidate.names[0].sourcePage, 4);
  assert.equal(result.cycles[0].arrest.date.sourcePage, 5);
  assert.equal(result.cycles[0].arrest.date.sourceLine.start, 4);
});

test("arrest, filed, amended, and court charges stay in separate stages", function () {
  var result = parse(
    [
      "TEXAS CRIMINAL HISTORY",
      "ARREST CYCLE 1",
      "ARREST DATE: 01/02/2020",
      "ARREST CHARGE: AGGRAVATED ASSAULT STATUTE/22.02 CLASS/F2",
      "FILED CHARGE: ASSAULT CAUSES BODILY INJURY",
      "AMENDED CHARGE: CLASS A ASSAULT",
      "COURT: COUNTY COURT AT LAW DOCKET/C-001",
      "COURT CHARGE: ASSAULT",
      "DISPOSITION: CONVICTED 02/03/2021",
      "SENTENCE: 180 DAYS, SUSPENDED"
    ].join("\n")
  );
  var cycle = result.cycles[0];

  assert.equal(cycle.arrestCharges.length, 1);
  assert.equal(cycle.prosecution.filedCharges.length, 1);
  assert.equal(cycle.prosecution.amendedCharges.length, 1);
  assert.equal(cycle.courtCases.length, 1);
  assert.equal(cycle.courtCases[0].charges.length, 1);
  assert.equal(cycle.courtCases[0].docketNumber.value, "C-001");
  assert.equal(cycle.dispositions[0].convictionStatus, "explicit_conviction");
  assert.equal(result.summary.explicitConvictions, 1);
});

test("dismissed arrest is never summarized as a conviction", function () {
  var result = parse(
    [
      "TEXAS CRIMINAL HISTORY",
      "ARREST CYCLE 1",
      "ARREST DATE: 06/14/2024",
      "ARREST CHARGE: AGGRAVATED ASSAULT",
      "DISPOSITION: DISMISSED"
    ].join("\n")
  );

  assert.equal(result.summary.explicitConvictions, 0);
  assert.match(result.summary.text, /dismissed/i);
  assert.doesNotMatch(result.summary.text, /aggravated assault[^\n]*conviction explicitly reported/i);
});

test("charge wording and a sentence cannot manufacture a conviction", function () {
  var result = parse(
    [
      "ARREST CYCLE 1",
      "ARREST CHARGE: POSSESSION OF FIREARM BY CONVICTED FELON",
      "SENTENCE: FIVE YEARS"
    ].join("\n")
  );

  assert.equal(result.summary.explicitConvictions, 0);
  assert.ok(warningCodes(result).includes("sentence_without_disposition"));
  assert.ok(warningCodes(result).includes("charges_without_disposition"));
});

test("negative disposition is classified before the word convicted", function () {
  var result = parse(
    [
      "ARREST CYCLE 1",
      "ARREST CHARGE: THEFT",
      "DISPOSITION: NOT CONVICTED"
    ].join("\n")
  );
  assert.equal(result.cycles[0].dispositions[0].convictionStatus, "not_conviction");
  assert.equal(result.summary.explicitConvictions, 0);
});

test("no-conviction and reversed-conviction phrases cannot count positive", function () {
  [
    "NO CONVICTION",
    "NOT A CONVICTION",
    "NON-CONVICTION",
    "NO RECORD OF CONVICTION",
    "NO FINAL CONVICTION",
    "NO KNOWN CONVICTION",
    "DID NOT RESULT IN CONVICTION",
    "NOT RESULTING IN CONVICTION",
    "NEVER CONVICTED",
    "CONVICTION REVERSED",
    "CONVICTION OVERTURNED",
    "ADJUDICATION WITHHELD",
    "CONVICTION: NONE",
    "CONVICTION: UNKNOWN"
  ].forEach(function (outcome) {
    var result = parse(
      "ARREST CYCLE 1\nARREST CHARGE: THEFT\nDISPOSITION: " + outcome
    );
    assert.notEqual(
      result.cycles[0].dispositions[0].convictionStatus,
      "explicit_conviction",
      outcome
    );
    assert.equal(result.summary.explicitConvictions, 0, outcome);
  });
});

test("possible, alleged, and conflicting outcomes remain uncertain", function () {
  ["POSSIBLE CONVICTION", "ALLEGED CONVICTION"].forEach(function (outcome) {
    var result = parse(
      "ARREST CYCLE 1\nARREST CHARGE: THEFT\nDISPOSITION: " + outcome
    );
    assert.equal(result.cycles[0].dispositions[0].convictionStatus, "uncertain");
    assert.equal(result.summary.explicitConvictions, 0);
  });

  var conflicting = parse(
    "ARREST CYCLE 1\nARREST CHARGE: THEFT\nDISPOSITION: DISMISSED; REFILED AND CONVICTED"
  );
  assert.equal(conflicting.cycles[0].dispositions[0].convictionStatus, "uncertain");
  assert.equal(conflicting.summary.explicitConvictions, 0);
  assert.ok(warningCodes(conflicting).includes("conflicting_disposition_terms"));

  [
    "GUILTY; LATER DISMISSED",
    "GUILTY; OTHER COUNT ACQUITTED",
    "GUILTY; SENTENCE PENDING"
  ].forEach(function (outcome) {
    var result = parse(
      "ARREST CYCLE 1\nARREST CHARGE: THEFT\nDISPOSITION: " + outcome
    );
    assert.equal(result.cycles[0].dispositions[0].convictionStatus, "uncertain");
    assert.equal(result.summary.explicitConvictions, 0);
  });
});

test("a later explicit conviction is not hidden by an earlier deferred stage", function () {
  var result = parse(
    "ARREST CYCLE 1\nARREST CHARGE: THEFT\nDISPOSITION: DEFERRED ADJUDICATION REVOKED; CONVICTED"
  );
  assert.equal(result.cycles[0].dispositions[0].convictionStatus, "explicit_conviction");
  assert.equal(result.summary.explicitConvictions, 1);
});

test("a plea without adjudication remains uncertain", function () {
  var result = parse(
    [
      "ARREST CYCLE 1",
      "ARREST CHARGE: THEFT",
      "DISPOSITION: PLEA: GUILTY",
      "SENTENCE: 12 MONTHS"
    ].join("\n")
  );
  assert.equal(result.cycles[0].dispositions[0].convictionStatus, "uncertain");
  assert.equal(result.summary.explicitConvictions, 0);
  assert.ok(warningCodes(result).includes("uncertain_disposition"));
});

test("ambiguous dates remain raw and carry a warning", function () {
  var result = parse("ARREST CYCLE 1\nARREST DATE: 01/02/20");
  var fact = result.cycles[0].arrest.date;
  assert.equal(fact.value, "01/02/20");
  assert.equal(fact.normalizedValue, undefined);
  assert.ok(warningCodes(result).includes("ambiguous_date"));
});

test("multiple explicit arrest markers produce independent cycles", function () {
  var result = parse(
    [
      "ARREST CYCLE 1",
      "ARREST DATE: 01/01/2020",
      "ARREST CHARGE: THEFT",
      "DISPOSITION: DISMISSED",
      "ARREST CYCLE 2",
      "ARREST DATE: 02/02/2021",
      "ARREST CHARGE: TRESPASS",
      "DISPOSITION: CONVICTED"
    ].join("\n")
  );
  assert.equal(result.cycles.length, 2);
  assert.equal(result.cycles[0].arrest.date.normalizedValue, "2020-01-01");
  assert.equal(result.cycles[1].arrest.date.normalizedValue, "2021-02-02");
  assert.equal(result.summary.explicitConvictions, 1);
});

test("a repeated numbered cycle header on a continuation page reuses the cycle", function () {
  var result = rapSheet.parseRapSheetPages(
    [
      {
        pageNumber: 1,
        text: "ARREST CYCLE 01\nARREST DATE: 01/01/2020\nARREST CHARGE: THEFT"
      },
      {
        pageNumber: 2,
        text: "ARREST CYCLE 1\nDISPOSITION: DISMISSED"
      }
    ],
    deterministicOptions()
  );

  assert.equal(result.cycles.length, 1);
  assert.equal(result.cycles[0].sourceCycleNumber, "1");
  assert.equal(result.cycles[0].dispositions[0].chargeId, result.cycles[0].arrestCharges[0].chargeId);
  assert.equal(result.summary.incompleteOrConflictingCycles, 0);
  assert.ok(!warningCodes(result).includes("orphan_disposition"));
  assert.ok(!warningCodes(result).includes("charges_without_disposition"));
});

test("label-like tokens inside a charge remain part of the charge text", function () {
  [
    "FAIL TO COMPLY SEX/OFFENDER REGISTRATION",
    "UNAUTHORIZED USE DL/IDENTIFICATION",
    "MISUSE FBI/IDENTIFIER",
    "FALSE SID/INFORMATION",
    "FAILURE TO APPEAR CASE/RELATED",
    "VIOLATION OF PROBATION/CONDITIONS",
    "UNAUTHORIZED RELEASE/CUSTODY",
    "FAILURE TO PAY FINE/COSTS"
  ].forEach(function (chargeText) {
    var result = parse("ARREST CYCLE 1\nARREST CHARGE: " + chargeText);
    assert.equal(result.cycles[0].arrestCharges[0].description.value, chargeText);
    assert.equal(result.subjectCandidate.identifiers.fbiNumber, null);
    assert.equal(result.subjectCandidate.identifiers.driverLicenses.length, 0);
    assert.equal(result.subjectCandidate.identifiers.stateIds.length, 0);
    assert.equal(result.subjectCandidate.descriptors.sex.length, 0);
    assert.equal(result.cycles[0].courtCases.length, 0);
    assert.equal(result.cycles[0].sentences.length, 0);
    assert.equal(result.cycles[0].supervision.length, 0);
  });
});

test("a compact labeled stage chain is parsed sequentially", function () {
  var result = parse(
    "ARREST DATE/01/01/2020 ARREST CHARGE/THEFT DISPOSITION/DISMISSED SENTENCE/NONE"
  );
  var cycle = result.cycles[0];
  assert.equal(cycle.arrest.date.normalizedValue, "2020-01-01");
  assert.equal(cycle.arrestCharges[0].description.value, "THEFT");
  assert.equal(cycle.dispositions[0].convictionStatus, "not_conviction");
  assert.equal(cycle.sentences[0].detail.value, "NONE");
  assert.equal(result.summary.explicitConvictions, 0);
});

test("section changes prevent statute and disposition links from leaking across stages", function () {
  var result = parse(
    [
      "ARREST CYCLE 1",
      "ARREST CHARGE: THEFT",
      "PROSECUTION",
      "STATUTE: 31.03",
      "COURT",
      "COURT CHARGE: THEFT",
      "DISPOSITION: DISMISSED",
      "PROSECUTION",
      "FILED CHARGE: TRESPASS",
      "DISPOSITION: CONVICTED"
    ].join("\n")
  );
  var cycle = result.cycles[0];

  assert.equal(cycle.arrestCharges[0].statute, null);
  assert.equal(cycle.prosecution.filedCharges[0].statute.value, "31.03");
  assert.equal(cycle.courtCases[0].dispositionIds.length, 1);
  assert.equal(
    cycle.dispositions[1].possibleChargeId,
    cycle.prosecution.filedCharges[1].chargeId
  );
  assert.notEqual(
    cycle.dispositions[1].possibleChargeId,
    cycle.courtCases[0].charges[0].chargeId
  );
});

test("ARREST number shorthand is retained instead of becoming a cycle heading", function () {
  var result = parse("ARREST # 00012345\nARREST CHARGE: THEFT");
  assert.equal(result.cycles.length, 1);
  assert.equal(result.cycles[0].arrest.arrestNumber.value, "00012345");
});

test("unknown and malicious-looking text is inert and preserved for review", function () {
  global.__rapSheetExecuted = false;
  var source =
    "MYSTERY BLOCK\n<script>global.__rapSheetExecuted = true</script>\nUNSUPPORTED LABEL: VALUE";
  var result = parse(source);

  assert.equal(global.__rapSheetExecuted, false);
  assert.equal(result.unparsedSections.length, 1);
  assert.equal(result.unparsedSections[0].sourceText, source);
  delete global.__rapSheetExecuted;
});

test("input limits reject instead of parsing a partial record", function () {
  var result = parse("ARREST DATE: 01/01/2020", {
    limits: {
      maxCharacters: 10,
      maxPages: 10,
      maxLines: 10,
      maxLineLength: 100
    }
  });
  assert.equal(result.reviewStatus, "rejected");
  assert.equal(result.cycles.length, 0);
  assert.ok(warningCodes(result).includes("character_limit_exceeded"));
});

test("field, fact, and cycle limits reject before exposing a partial review", function () {
  var tooManyFields = parse("NAM/A DOB/19800101 FBI/123 SID/TX1", {
    limits: { maxFieldsPerLine: 2 }
  });
  assert.equal(tooManyFields.reviewStatus, "rejected");
  assert.equal(tooManyFields.subjectCandidate.names.length, 0);
  assert.ok(warningCodes(tooManyFields).includes("fields_per_line_limit_exceeded"));

  var tooManyFacts = parse(
    "NAM/A\nAKA/B\nAKA/C\nAKA/D",
    { limits: { maxFacts: 2 } }
  );
  assert.equal(tooManyFacts.reviewStatus, "rejected");
  assert.equal(tooManyFacts.subjectCandidate.names.length, 0);
  assert.ok(warningCodes(tooManyFacts).includes("fact_limit_exceeded"));

  var tooManyCycles = parse(
    "ARREST CYCLE 1\nARREST DATE: 01/01/2020\nARREST CYCLE 2\nARREST DATE: 02/02/2021",
    { limits: { maxCycles: 1 } }
  );
  assert.equal(tooManyCycles.reviewStatus, "rejected");
  assert.equal(tooManyCycles.cycles.length, 0);
  assert.ok(warningCodes(tooManyCycles).includes("cycle_limit_exceeded"));

  var tooManyUnparsed = parse("UNKNOWN A\n\nUNKNOWN B\n\nUNKNOWN C", {
    limits: { maxUnparsedSections: 2 }
  });
  assert.equal(tooManyUnparsed.reviewStatus, "rejected");
  assert.equal(tooManyUnparsed.unparsedSections.length, 0);
  assert.ok(
    warningCodes(tooManyUnparsed).includes("unparsed_section_limit_exceeded")
  );
});

test("XML is detected and held for a future source adapter", function () {
  var result = parse("<?xml version=\"1.0\"?><RapSheet><Name>Doe</Name></RapSheet>");
  assert.equal(result.source.detectedFormat, "xml");
  assert.equal(result.reviewStatus, "needs_source_adapter");
  assert.equal(result.cycles.length, 0);
  assert.ok(warningCodes(result).includes("unsupported_xml"));
});

test("deterministic hooks control IDs and timestamps", function () {
  var result = parse("NAM/DOE, JOHN\nARREST CYCLE 1\nARREST DATE: 01/01/2020");
  assert.equal(result.id, "rap-import-test-1");
  assert.equal(result.source.importedAt, "2026-08-25T12:00:00.000Z");
  assert.match(result.subjectCandidate.names[0].factId, /^fact-test-/);
  assert.equal(result.auditTrail[0].at, "2026-08-25T12:00:00.000Z");
});

test("summary always labels an unreviewed parse as draft", function () {
  var result = parse(
    "ARREST CYCLE 1\nARREST CHARGE: THEFT\nDISPOSITION: CONVICTED"
  );
  assert.equal(result.summary.statusLabel, "DRAFT / UNVERIFIED");
  assert.match(result.summary.text, /^CRIMINAL HISTORY SUMMARY — DRAFT \/ UNVERIFIED/);
});

test("review corrections cannot count a rejected source disposition", function () {
  var result = parse(
    "ARREST CYCLE 1\nARREST CHARGE: THEFT\nDISPOSITION: DISMISSED"
  );
  var disposition = result.cycles[0].dispositions[0];
  disposition.rawDisposition.reviewStatus = "rejected";
  disposition.outcome.reviewStatus = "accepted";
  disposition.outcome.correctedValue = "Convicted";
  result.summary = rapSheet.generateRapSheetSummary(result);
  assert.equal(result.summary.explicitConvictions, 0);
});

test("an accepted reviewer correction to a disposition drives the draft summary", function () {
  var result = parse(
    "ARREST CYCLE 1\nARREST CHARGE: THEFT\nDISPOSITION: CONVICTED"
  );
  var disposition = result.cycles[0].dispositions[0];
  disposition.rawDisposition.reviewStatus = "accepted";
  disposition.rawDisposition.correctedValue = "Dismissed";
  result.summary = rapSheet.generateRapSheetSummary(result);
  assert.equal(result.summary.explicitConvictions, 0);
  assert.equal(disposition.convictionStatus, "not_conviction");
  assert.match(result.summary.text, /dismissed/i);
});

test("review decisions and corrections control disposition dates in summaries", function () {
  var rejectedDate = parse(
    "ARREST CYCLE 1\nARREST CHARGE: THEFT\nDISPOSITION: CONVICTED 01/02/2020"
  );
  rejectedDate.cycles[0].dispositions[0].date.reviewStatus = "rejected";
  rejectedDate.summary = rapSheet.generateRapSheetSummary(rejectedDate);
  assert.equal(rejectedDate.summary.mostRecentConviction, null);
  assert.doesNotMatch(rejectedDate.summary.historyItems[0].text, /2020-01-02/);

  var correctedDate = parse(
    "ARREST CYCLE 1\nARREST CHARGE: THEFT\nDISPOSITION: CONVICTED 01/02/2020"
  );
  correctedDate.cycles[0].dispositions[0].date.reviewStatus = "accepted";
  correctedDate.cycles[0].dispositions[0].date.correctedValue = "02/03/2025";
  correctedDate.summary = rapSheet.generateRapSheetSummary(correctedDate);
  assert.equal(correctedDate.summary.mostRecentConviction, "2025-02-03");
  assert.match(correctedDate.summary.historyItems[0].text, /2025-02-03/);
});

test("an orphan conviction disposition stays explicit but marks its cycle incomplete", function () {
  var result = parse("ARREST CYCLE 1\nDISPOSITION: CONVICTED");
  assert.equal(result.summary.explicitConvictions, 1);
  assert.equal(result.summary.incompleteOrConflictingCycles, 1);
  assert.match(result.summary.historyItems[0].text, /^Unlinked disposition/);
  assert.ok(warningCodes(result).includes("orphan_disposition"));
});

test("rejected input summary is labeled not parsed", function () {
  var result = parse("");
  assert.equal(result.summary.statusLabel, "NOT PARSED");
});

process.stdout.write("\n" + passed + " RAP-sheet parser tests passed.\n");
