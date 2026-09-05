"use strict";
const assert = require("assert");
const { createHash } = require("crypto");
const { loadScript } = require("./support/copdoc-vm-harness");
const { setup, dataFixture } = require("./test-stage6-report-parity");
const { boot, SUBJECT_ID } = require("./test-stage3-narrative-page");
const KEY = "copdocx.document-generations.v1";
const hash = value => createHash("sha256").update(value).digest("hex");
function receipts(context) {
  const ledger = JSON.parse(context.localStorage.getItem(KEY) || '{"records":{}}');
  return Object.values(ledger.records);
}
async function reportDelivery() {
  const t = setup(), data = dataFixture(t);
  t.context.COPDoc.baseball.renderPhoto = async () => "data:image/png;base64,AQ==";
  loadScript(t.context, "functions/arrest-roster.js");
  const host = t.document.createElement("div"); t.document.body.appendChild(host);
  const roster = t.context.COPDoc.arrestRoster.mount(host, { defaultToday: false });
  const report = await roster.generate();
  assert.strictEqual(receipts(t.context).length, 0, "preview is read-only");
  const writes = [];
  t.context.isSecureContext = true;
  t.context.ClipboardItem = class { constructor(data) { this.data = data; } };
  t.context.navigator.clipboard = { write: async items => writes.push(items[0].data) };
  data.people.p1.name.firstName = "CHANGED AFTER PREVIEW";
  assert.strictEqual(await t.context.COPDoc.arrestRoster.copyReport(), true);
  assert.strictEqual(await writes[0]["text/html"].text(), report.html, "copy uses captured preview rows, never re-reads current Person");
  const first = receipts(t.context)[0];
  assert.strictEqual(first.outputHash, hash(report.html));
  assert.strictEqual(first.deliveries[0].status, "SUCCEEDED");
  assert.ok(first.sources.some(source => source.type === "EncounterSubject" && source.id === "s1"));
  assert.ok(!t.context.localStorage.getItem(KEY).includes("FINAL 1"), "ledger excludes narrative/card text");
  let plain = "";
  t.context.navigator.clipboard = {write: async () => { throw new Error("blocked"); }, writeText: async value => { plain = value; }};
  assert.strictEqual(await t.context.COPDoc.arrestRoster.copyReport(), true);
  assert.strictEqual(plain, report.plainText);
  const second = receipts(t.context)[1];
  assert.strictEqual(second.outputHash, hash(report.html), "generated HTML hash remains unchanged");
  assert.strictEqual(second.deliveries[0].outputHash, hash(plain), "fallback records the delivered text hash");
  t.storage.failNext(KEY);
  const copyCount = writes.length;
  assert.strictEqual(await t.context.COPDoc.arrestRoster.copyReport(), false, "failed receipt blocks release");
  assert.strictEqual(writes.length, copyCount);
  assert.match(t.document.getElementById("arrestReportCopyStatus").textContent, /could not be recorded/);
  let deliveredOnce = 0;
  t.context.navigator.clipboard = { write: async () => { deliveredOnce += 1; t.storage.failNext(KEY); } };
  assert.strictEqual(await t.context.COPDoc.arrestRoster.copyReport(), false);
  assert.strictEqual(deliveredOnce, 1, "post-copy quota failure must never retry clipboard or fall back");
  assert.match(t.document.getElementById("arrestReportCopyStatus").textContent, /Report copied, but its delivery record could not be saved/);
  assert.strictEqual(receipts(t.context).at(-1).deliveries.length, 0, "annotation failure cannot fabricate FAILED delivery");
  roster.destroy();
}
async function cardDelivery() {
  const card = require("./test-baseball-copy");
  const { context } = card;
  loadScript(context, "functions/baseball-card-contract.js");
  const state = context.COPDoc.baseball.normalizeState({
    fields: {baseballFirstName:"SYNTHETIC",baseballLastName:"CARD"},
    content: {narrative:"unused seed",heading:"heading",bullets:[]},
    photoAdjustments:{zoom:1.4,rotation:12},layout:{cardWidthPx:900}
  });
  context.getBaseballCardState = () => JSON.parse(JSON.stringify(state));
  let releasePhoto, beganPhoto;
  const rendering = new Promise(resolve => { beganPhoto = resolve; });
  context.COPDoc.baseball.renderPhoto = async snapshot => {
    beganPhoto(); await new Promise(resolve => { releasePhoto = resolve; });
    assert.strictEqual(snapshot.layout.cardWidthPx, 900, "renderer receives frozen captured state");
    return "data:image/png;base64,AQ==";
  };
  const copy = context.copyBaseballCard();
  await rendering;
  card.narrative.textContent = "EDIT AFTER PHOTO STARTED";
  state.layout.cardWidthPx = 1400;
  releasePhoto();
  assert.strictEqual(await copy, true);
  const html = card.getCopiedHtml();
  assert.ok(html.includes("ICE Dallas arrested Ana GARCIA."));
  assert.ok(!html.includes("EDIT AFTER PHOTO STARTED"));
  const record = receipts(context)[0];
  assert.strictEqual(record.outputHash, hash(html));
  assert.strictEqual(record.deliveries[0].outputHash, hash(html));
  const workspaceBefore = context.localStorage.getItem("copdocx.store.v1");
  context.COPDoc.baseball.renderPhoto = async () => "data:image/png;base64,AQ==";
  const setItem = context.localStorage.setItem.bind(context.localStorage);
  const execCommand = context.document.execCommand;
  let failDelivery = false, copyCalls = 0;
  context.document.execCommand = command => {
    const ok = execCommand(command);
    if (ok) { failDelivery = true; copyCalls += 1; }
    return ok;
  };
  context.localStorage.setItem = (key, value) => {
    if (key === KEY && failDelivery) { failDelivery = false; throw new Error("quota after copy"); }
    return setItem(key, value);
  };
  assert.strictEqual(await context.copyBaseballCard(), false);
  assert.strictEqual(copyCalls, 1, "card must never retry a successful copy after receipt quota failure");
  assert.match(card.ids.baseballCardStatus.textContent, /Card copied, but its delivery record could not be saved/);
  assert.strictEqual(receipts(context).at(-1).deliveries.length, 0);
  const latestCopied = card.getCopiedHtml();
  context.COPDoc.documents.generate = async () => { throw new Error("synthetic receipt failure"); };
  assert.strictEqual(await context.copyBaseballCard(), false);
  assert.strictEqual(card.getCopiedHtml(), latestCopied, "failed record never copies a newer card");
  assert.strictEqual(context.localStorage.getItem("copdocx.store.v1"), workspaceBefore);
}
async function narrativeDelivery() {
  const app = boot({existing:true,locked:true});
  const saved = app.narrative();
  const workspaceBefore = app.storage.raw("copdocx.store.v1");
  assert.strictEqual(await app.engine.copyOutput("UNSAVED REPLACEMENT"), true);
  assert.strictEqual(app.copied[0], saved.output.finalPlainText, "locked text ignores live editor replacement");
  const record = receipts(app.context)[0];
  assert.strictEqual(record.outputHash, hash(saved.output.finalPlainText));
  assert.ok(record.sources.some(source => source.type === "EncounterSubject" && source.id === SUBJECT_ID));
  assert.strictEqual(app.storage.raw("copdocx.store.v1"), workspaceBefore, "copy cannot save or mutate a closed Encounter");
  app.storage.failNext(KEY);
  assert.strictEqual(await app.engine.copyOutput("ANOTHER REPLACEMENT"), false);
  assert.strictEqual(app.copied.length, 1, "failed receipt blocks clipboard");
  const draft = boot();
  draft.engine.setManualText("Manual draft remains a draft.");
  const before = draft.storage.raw("copdocx.store.v1");
  assert.strictEqual(await draft.engine.copyOutput("Manual draft remains a draft."), true);
  assert.strictEqual(draft.storage.raw("copdocx.store.v1"), before, "export is separate from Save/Review/close");
  assert.strictEqual(draft.narrative(), undefined);
  const draftReceipt = receipts(draft.context)[0];
  assert.strictEqual(draftReceipt.outputHash, hash("Manual draft remains a draft."));
  assert.ok(draftReceipt.sources.every(source => source.authority === "draft"));
  let deliveredOnce = 0;
  draft.context.navigator.clipboard.writeText = async () => { deliveredOnce += 1; draft.storage.failNext(KEY); };
  assert.strictEqual(await draft.engine.copyOutput("Manual draft remains a draft."), false);
  assert.strictEqual(deliveredOnce, 1);
  assert.match(draft.status(), /Narrative exported, but its delivery record could not be saved/);
  assert.strictEqual(receipts(draft.context).at(-1).deliveries.length, 0);
}
(async function () {
  await reportDelivery(); await cardDelivery(); await narrativeDelivery();
  console.log("STAGE7_REPORT_DOCUMENTS_PASSED frozen preview/card inputs, precise delivery hashes, receipt failure gates, immutable closed narrative and unsaved drafts.");
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
