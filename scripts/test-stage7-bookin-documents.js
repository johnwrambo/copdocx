"use strict";

// Synthetic data. Execute the production click handler and PDF field writers;
// replace only pdf-lib geometry/serialization so the offline golden is stable.
const assert = require("assert");
const crypto = require("crypto");
const { createMemoryStorage, createMinimalDocument, loadModelTab, loadScript, quietConsole, run } = require("./support/copdoc-vm-harness");
const BOOKING_KEY = "alien-book-in.saved-records.v1";
const clone = value => JSON.parse(JSON.stringify(value));

function fixture() {
  const data = {
    firstName: "Ada", lastName: "TEST", aNumber: "000000123", iceEvent: "EVENT-7",
    officersName: "Officer Test", dateTime: "2026-09-05T14:30", dateOfBirth: "1990-02-03",
    age: "36", gender: "Female", countryOfCitizenship: "Exampleland", caseType: "NTA",
    team: "Team Test", cash: "12.5", travelDocs: "Passport", propertyTag: "TAG-7",
    cellNum: "Cell 2", children: "No dependent care needs", medicalIssues: "Asthma; follow-up required",
    medicine: "Albuterol", communicationAnswer: "yes", q1Answer: "yes", q2Answer: "yes",
    additionalObservations: "Needs an inhaler available", referralAnswer: "yes"
  };
  for (let q = 3; q <= 13; q += 1) {
    data["q" + q + "Answer"] = q % 2 ? "yes" : "no";
    data["q" + q + "Details"] = "Question " + q + " detail";
  }
  return data;
}

function setup(initial) {
  const storage = createMemoryStorage(initial);
  const document = createMinimalDocument("bookin");
  const button = { disabled: false };
  const number = { classList: { add() {}, remove() {} } };
  document.getElementById = id => id === "generateButton" ? button : id === "alienNumber" ? number : null;
  const r = loadModelTab(storage, { document, console: quietConsole(), location: { search: "", pathname: "/bookin.html" } });
  r.context.crypto = crypto.webcrypto;
  r.context.TextEncoder = TextEncoder;
  r.context.TextDecoder = TextDecoder;
  r.context.navigator.locks = { request: async (_name, _options, callback) => callback() };
  ["functions/workspace-config.js", "functions/document-context.js", "functions/document-registry.js", "functions/document-fingerprints.js", "functions/document-generation.js", "functions/book-in.js"].forEach(file => loadScript(r.context, file));
  r.context.__form = fixture();
  r.context.__statuses = [];
  r.context.__downloads = [];
  r.context.__runs = [];
  r.context.__captured = [];
  r.context.__confirm = async () => true;
  r.context.__afterLoad = async () => {};
  r.context.__fields = {};
  r.context.__checks = {};
  r.context.__loaded = 0;
  r.context.PDFLib = { StandardFonts: { Helvetica: "Helvetica" } };
  const generate = r.context.COPDoc.documents.generate;
  r.context.COPDoc.documents.generate = async options => {
    r.context.__captured.push(options.context);
    const result = await generate(options);
    r.context.__runs.push(result);
    return result;
  };
  run(r.context, `
    collectFormData = function () { return __form; };
    setStatus = function (message, level) { __statuses.push({ message: message, level: level }); };
    confirmMissingGenerateFields = async function () { return __confirm(); };
    downloadPdf = function (data, filename) { __downloads.push({data:data,filename:filename}); };
    ensureMedicalPdfFields = function () {};
    ensureCapWidgetsAttached = function () {};
    removeCapLabelSeparators = function () {};
    extendCapFieldUnderlines = function () {};
    loadPdfFromBase64 = async function () {
      __loaded += 1;
      await __afterLoad();
      var form = {
        getTextField: function (name) {
          if (name === __missingField) throw new Error("Missing synthetic field");
          return {
            acroField: {getWidgets:function(){return [{getRectangle:function(){return {x:0,y:0,width:200,height:30};},setRectangle:function(){}}];}},
            isMultiline:function(){return false;},enableMultiline:function(){},disableMultiline:function(){},setFontSize:function(){},
            setText:function(value){__fields[name]=value;}
          };
        },
        getCheckBox:function(name){return {check:function(){__checks[name]=true;},uncheck:function(){__checks[name]=false;}};},
        updateFieldAppearances:function(){}
      };
      return {
        getForm:function(){return form;},
        embedFont:async function(){return {widthOfTextAtSize:function(text,size){return text.length*size/2;},heightAtSize:function(size){return size;}};},
        save:async function(options){__saveOptions=options;return new TextEncoder().encode(JSON.stringify({fields:__fields,checks:__checks}));}
      };
    };
  `);
  r.context.__missingField = "";
  return { ...r, storage, button };
}

const expectedText = {
  alien_name: "TEST, Ada", a_number: "000000123", age: "36", date_of_birth: "02/03/1990",
  gender: "Female", country_of_citizenship: "Exampleland", officer_name: "Officer Test",
  event_number: "EVENT-7", date_completed: "09/05/2026",
  q1_medical_mental_details: "Asthma; follow-up required", q2_medications_details: "Albuterol",
  q3_allergies_details: "Question 3 detail", q4_drug_use_details: "Question 4 detail",
  q5_pregnancy_details: "Question 5 detail", q6_nursing_details: "Question 6 detail",
  q7_ill_injured_pain_details: "Question 7 detail", q8_skin_rash_details: "Question 8 detail",
  q9_contagious_disease_details: "Question 9 detail", q10_harm_thoughts_details: "Question 10 detail",
  q11_fever_details: "Question 11 detail", q12_cough_breathing_details: "Question 12 detail",
  q13_gastrointestinal_details: "Question 13 detail", additional_observations: "Needs an inhaler available",
  "First Name": "Ada", "Last Name": "TEST", "ICE EVENT": "EVENT-7", "Arresting Officers Name": "Officer Test",
  "Type of Case NTA ER Reinstatement BB Etc": "NTA", Medicine: "Albuterol",
  "Medical Issues": "Q1: Asthma; follow-up required; Q2: Prescription medication; Q3: Food allergy; Q5: Pregnancy; Q7: Illness/injury/significant pain; Q9: Contagious disease; Q11: Fever; Q13: Nausea/vomiting/diarrhea. See medical form for details.",
  PregnancyBreastfeedingChildcare: "No dependent care needs", FundsMoney: "$12.50", "Travel Document ID": "Passport",
  "Property Tag I77": "TAG-7", "DateTime In": "09/05/2026, 02:30 PM", "Holding Cell": "Cell 2", Team: "Team Test"
};
const checkboxStems = ["communication", "q1_medical_mental", "q2_medications", "q3_allergies", "q4_drug_use", "q5_pregnant", "q6_nursing", "q7_ill_injured_pain", "q8_skin_rash", "q9_contagious_disease", "q10_harm_thoughts", "q11_fever", "q12_cough_breathing", "q13_gastrointestinal", "medical_assessment_referral"];

async function immutableGoldenAndReceipts() {
  const r = setup();
  r.context.__confirm = async () => { r.context.__form.firstName = "Changed during confirmation"; return true; };
  r.context.__afterLoad = async () => { r.context.__form.medicine = "Changed while PDF loaded"; };
  await run(r.context, "generateCombinedPacket()");
  assert.strictEqual(r.context.__downloads.length, 1, JSON.stringify(r.context.__statuses));
  assert.deepStrictEqual(clone(r.context.__fields), expectedText);
  const expectedChecks = {};
  checkboxStems.forEach((stem, index) => {
    const yes = index === 0 || index === 1 || index === 2 || index === 14 || index % 2 === 1;
    expectedChecks[stem + "_yes"] = yes;
    expectedChecks[stem + "_no"] = !yes;
  });
  assert.deepStrictEqual(clone(r.context.__checks), expectedChecks);
  assert.deepStrictEqual(clone(r.context.__saveOptions), { updateFieldAppearances: false, useObjectStreams: true });
  assert.strictEqual(r.context.__downloads[0].filename, "TEST_EVENT-7_Book_in.pdf");
  const captured = r.context.__captured[0], generation = r.context.__runs[0];
  assert.ok(Object.isFrozen(captured) && Object.isFrozen(captured.input));
  assert.strictEqual(captured.input.firstName, "Ada");
  assert.strictEqual(captured.input.medicine, "Albuterol");
  assert.strictEqual(captured.generatingOfficerId, null, "a typed officer name is not an authenticated generating officer");
  assert.deepStrictEqual(clone(captured.sources), [{ type: "BOOKIN_FORM", id: "unsaved", revision: "", authority: "draft" }]);
  assert.strictEqual(generation.record.status, "GENERATED");
  assert.strictEqual(generation.record.outputHash, crypto.createHash("sha256").update(Buffer.from(r.context.__downloads[0].data)).digest("hex"));
  assert.strictEqual(r.button.disabled, false);
}

async function cancelAndFailureBoundaries() {
  const cancelled = setup();
  cancelled.context.__form.firstName = "";
  cancelled.context.__confirm = async () => false;
  await run(cancelled.context, "generateCombinedPacket()");
  assert.strictEqual(cancelled.context.__downloads.length, 0);
  assert.strictEqual(cancelled.context.__captured.length, 0);
  assert.strictEqual(cancelled.context.__loaded, 0);
  assert.match(cancelled.context.__statuses.at(-1).message, /cancelled/i);

  const failed = setup();
  failed.storage.failNext(failed.context.COPDoc.documents.storageKey);
  await run(failed.context, "generateCombinedPacket()");
  assert.strictEqual(failed.context.__downloads.length, 0, "no artifact is delivered without its saved generation receipt");
  assert.strictEqual(failed.context.__loaded, 0);
  assert.match(failed.context.__statuses.at(-1).message, /history could not be saved/);
  assert.strictEqual(failed.button.disabled, false);

  const completionFailed = setup();
  completionFailed.context.__afterLoad = async () => completionFailed.storage.failNext(completionFailed.context.COPDoc.documents.storageKey);
  await run(completionFailed.context, "generateCombinedPacket()");
  assert.strictEqual(completionFailed.context.__loaded, 1);
  assert.strictEqual(completionFailed.context.__downloads.length, 0, "a rendered PDF is withheld when its final receipt cannot be saved");
  assert.match(completionFailed.context.__statuses.at(-1).message, /history could not be saved/);

  const renderFailed = setup();
  renderFailed.context.__afterLoad = async () => { throw new Error("Synthetic template load failed"); };
  await run(renderFailed.context, "generateCombinedPacket()");
  assert.strictEqual(renderFailed.context.__downloads.length, 0);
  assert.match(renderFailed.context.__statuses.at(-1).message, /template load failed/);

  const deliveryFailed = setup();
  run(deliveryFailed.context, 'downloadPdf=function(){throw new Error("Synthetic browser download failed");};');
  await run(deliveryFailed.context, "generateCombinedPacket()");
  assert.match(deliveryFailed.context.__statuses.at(-1).message, /browser download failed/);
  const deliveredRecord = deliveryFailed.context.COPDoc.documents.get(deliveryFailed.context.__runs[0].record.generationId);
  assert.strictEqual(deliveredRecord.status, "GENERATED", "failed browser delivery does not erase the generated artifact's provenance");
  assert.ok(deliveredRecord.deliveries.some(delivery => delivery.status === "FAILED"));

  const deliveryReceiptFailed = setup();
  deliveryReceiptFailed.context.__afterDownload = () => deliveryReceiptFailed.storage.failNext(deliveryReceiptFailed.context.COPDoc.documents.storageKey);
  run(deliveryReceiptFailed.context, 'downloadPdf=function(data,filename){__downloads.push({data:data,filename:filename});__afterDownload();};');
  await run(deliveryReceiptFailed.context, "generateCombinedPacket()");
  assert.strictEqual(deliveryReceiptFailed.context.__downloads.length, 1, "the browser submission has already happened when its annotation write fails");
  const unannotated = deliveryReceiptFailed.context.COPDoc.documents.get(deliveryReceiptFailed.context.__runs[0].record.generationId);
  assert.strictEqual(unannotated.status, "GENERATED");
  assert.strictEqual(unannotated.deliveries.length, 0, "a one-shot quota error must not create a false FAILED delivery after a successful submission");
  assert.strictEqual(deliveryReceiptFailed.context.__statuses.at(-1).level, "warning");
  assert.match(deliveryReceiptFailed.context.__statuses.at(-1).message, /download was submitted/);
  assert.match(deliveryReceiptFailed.context.__statuses.at(-1).message, /receipt could not be saved/);
  assert.doesNotMatch(deliveryReceiptFailed.context.__statuses.at(-1).message, /not been released|download failed/);

  const warning = setup();
  warning.context.__missingField = "q13_gastrointestinal_details";
  await run(warning.context, "generateCombinedPacket()");
  assert.strictEqual(warning.context.__downloads.length, 1);
  assert.strictEqual(warning.context.__statuses.at(-1).level, "warning");
  assert.match(warning.context.__statuses.at(-1).message, /q13_gastrointestinal_details/);
}

async function savedIdentityAndMedicalUnknowns() {
  const packet = { id: "book-7", updatedAt: "2026-09-05T12:00:00Z", formState: {}, firstName: "Saved earlier" };
  const r = setup({ [BOOKING_KEY]: [packet] });
  run(r.context, 'activeRecordId="book-7";activeRecordBaseUpdatedAt="2026-09-05T12:00:00Z";');
  await run(r.context, "generateCombinedPacket()");
  assert.strictEqual(r.context.__downloads.length, 1, JSON.stringify(r.context.__statuses));
  assert.strictEqual(r.context.__captured[0].entities.booking.firstName, "Saved earlier");
  assert.strictEqual(r.context.__captured[0].input.firstName, "Ada", "the saved packet must not overwrite current draft values");
  assert.ok(r.context.__captured[0].sources.some(source => source.type === "BOOKING" && source.id === "book-7"));

  r.storage.setRaw(BOOKING_KEY, [{ ...packet, updatedAt: "2026-09-05T13:00:00Z" }]);
  await run(r.context, "generateCombinedPacket()");
  assert.strictEqual(r.context.__downloads.length, 1);
  assert.match(r.context.__statuses.at(-1).message, /changed in another window/);
  r.storage.setRaw(BOOKING_KEY, [{ ...packet, voidedAt: "2026-09-05T13:00:00Z" }]);
  await run(r.context, "generateCombinedPacket()");
  assert.strictEqual(r.context.__downloads.length, 1);
  assert.match(r.context.__statuses.at(-1).message, /voided/);

  const unknown = setup();
  unknown.context.__form.q2Answer = "";
  unknown.context.__form.communicationAnswer = "";
  const output = await run(unknown.context, "renderBookInPacket(captureBookInDocumentContext(__form, null))");
  assert.strictEqual(unknown.context.__fields.Medicine, "", "an unanswered medication question cannot become No");
  assert.strictEqual(unknown.context.__checks.q2_medications_yes, false);
  assert.strictEqual(unknown.context.__checks.q2_medications_no, false);
  assert.strictEqual(unknown.context.__checks.communication_yes, false);
  assert.strictEqual(unknown.context.__checks.communication_no, false);
  assert.strictEqual(output.mimeType, "application/pdf");
}

(async () => {
  await immutableGoldenAndReceipts();
  await cancelAndFailureBoundaries();
  await savedIdentityAndMedicalUnknowns();
  console.log("STAGE7_BOOKIN_DOCUMENTS_PASSED frozen draft context, complete CAP/medical field golden, receipt-before-delivery, cancellation, render failures, stale/void guards and unknown answers.");
})().catch(error => { console.error(error); process.exitCode = 1; });
