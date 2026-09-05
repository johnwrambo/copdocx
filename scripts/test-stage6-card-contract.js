"use strict";
const assert = require("assert");
const { createMemoryStorage, loadModelTab, loadScript, quietConsole } = require("./support/copdoc-vm-harness.js");
const clone = value => JSON.parse(JSON.stringify(value));
const runtime = loadModelTab(createMemoryStorage(), { console: quietConsole() });
loadScript(runtime.context, "functions/baseball-card-contract.js");
const api = runtime.context.COPDoc.baseball;
// Synthetic fixture follows normalizeBaseballCardRecordState in supplied
// Alien_Book_In_Docs_v1_12_0.html: version 2 card embedded in schema 5 export.
const fixture = {
  version: 2,
  fields: { baseballFirstName:"diego", baseballLastName:"test seven", baseballAge:"47", baseballCountry:"Ecuador", baseballAlienNumber:"000000107", baseballArrestDate:"2026-09-05", baseballDisposition:"Reinstatement of Deportation Reasonable Fear", baseballFinalOrderDate:"2020-01-02", baseballFirstDeportationDate:"2021-02-03", baseballLastDeportationDate:"2022-03-04", futurePresentationField:"retain" },
  gender:"Male",
  criminalHistory:[
    {charge:"Theft",convictionDate:"2023-03-04",jurisdictionType:"City",jurisdiction:"fort worth",state:"tx",court:"Municipal Court",sourceId:"crime_a"},
    {charge:"Burglary",convictionDate:"2022-04-05",jurisdictionType:"County",jurisdiction:"tarrant",state:"tx",court:""},
    {charge:"Undated",convictionDate:"",county:"Dallas",state:"TX"}
  ],
  content:{narrative:"Manually edited narrative <script>never execute</script>.",heading:"Custom heading",bullets:["Retain first bullet", "<img src=x onerror=alert(1)>", ""]},
  contentEdited:true,
  photoDataUrl:"data:image/png;base64,aGVsbG8=",
  photoAdjustments:{zoom:2,positionX:25,positionY:60,rotation:90,flipX:true,brightness:115,contrast:125},
  layout:{cardWidthPx:1000,photoWidthPercent:40,photoHeightPx:500,lineWidthPx:0,lineStyle:"double",lineColor:"#aabbcc",headerHeightPx:54,headerFontSizePx:23,contentFontSizePx:17,contentPaddingPx:0,fontFamily:"Georgia, serif",lineHeight:1.6,extension:"layout-preserved"},
  savedAt:"2026-09-05T13:00:00.000Z",
  futureSource:{original:true},foreignWarrantsKnown:true,hasForeignWarrants:true,foreignWarrantCountry:"Example"
};
function sourceStateRoundTrip() {
  const original=clone(fixture);
  const card=api.toCanonical(fixture,{cardId:"bbc_source",personId:"p_owner",bookinRecordId:"b_owner",photoMediaId:"m_owner",source:{app:"Alien Book-In",schema:5}});
  const state=api.fromCanonical(card);
  assert.deepStrictEqual(clone(state.fields), fixture.fields);
  assert.deepStrictEqual(clone(state.content), fixture.content);
  assert.deepStrictEqual(clone(state.photoAdjustments), fixture.photoAdjustments);
  assert.deepStrictEqual(clone(state.layout), fixture.layout);
  assert.strictEqual(state.criminalHistory[0].jurisdictionType,"City");
  assert.strictEqual(state.criminalHistory[2].jurisdiction,"Dallas");
  assert.strictEqual(state.criminalHistory[2].jurisdictionType,"County");
  assert.strictEqual(state.criminalHistory[0].sourceId,"crime_a");
  assert.strictEqual(state.photoMediaId,"m_owner");
  assert.strictEqual(state.contentEdited,true);
  assert.deepStrictEqual(clone(state.futureSource),{original:true});
  assert.strictEqual(card.status,"SAVED","ordinary saved import cannot become finalized by accident");
  assert.strictEqual(card.finalizedSnapshot,undefined);
  assert.deepStrictEqual(fixture,original,"normalizing never mutates source data");
  const constructed=runtime.model.createBaseballCard(card);
  assert.deepStrictEqual(clone(constructed.state),clone(state));
  constructed.state.fields.baseballFirstName="changed";
  assert.strictEqual(card.state.fields.baseballFirstName,"diego","factory copies presentation data");
  const legacy=runtime.model.createBaseballCard({cardId:"old",html:"<p>Legacy <b>edited</b> text.</p><h2>Heading</h2><ul><li>One</li></ul>",text:"Original plain text",customLegacy:{kept:true}});
  assert.strictEqual(legacy.text,"Original plain text");
  assert.strictEqual(legacy.customLegacy.kept,true);
  const restored=api.fromCanonical(legacy);
  assert.strictEqual(restored.content.narrative,"Legacy edited text.");
  assert.deepStrictEqual(clone(restored.content.bullets),["One"]);
  assert.throws(()=>api.normalizeState({criminalHistory:{}}),/criminal history/);
  assert.throws(()=>api.normalizeState({photoDataUrl:"javascript:alert(1)"}),/photo/);
}
function sourceGeneratedContent() {
  const generated=api.generateContent(fixture);
  assert.strictEqual(generated.heading,"INTERNAL Background Required for Privacy Review:");
  assert.strictEqual(generated.narrative,
    "ICE Dallas arrested Diego TEST-Seven, A000 000 107, a 47-year-old citizen and national of Ecuador. TEST was ordered removed by an IJ on January 2, 2020. TEST was initially deported on February 3, 2021, and more recently deported on March 4, 2022. TEST has a criminal history of Theft in Fort Worth, TX (Municipal Court), for which he was convicted on March 4, 2023. TEST has a criminal history of Burglary in Tarrant County, TX, for which he was convicted on April 5, 2022. TEST has a criminal history of Undated in Dallas County, TX. TEST is now being processed under Reinstatement of Deportation Reasonable Fear.");
  assert.strictEqual(generated.bullets[0],"TEST has no T/U/VAWA visa applications.");
  assert.strictEqual(generated.bullets[generated.bullets.length-2],"Arrested on September 5, 2026.");
  assert.strictEqual(generated.bullets[generated.bullets.length-1],"Photo from arrest in the field.");
  const ordered=api.sortCriminalHistory(fixture.criminalHistory,"ascending");
  assert.deepStrictEqual(clone(ordered.map(row=>row.charge)),["Burglary","Theft","Undated"]);
  assert.strictEqual(fixture.criminalHistory[0].charge,"Theft","sorting explicit copy does not rewrite saved source order");
}
function emailAndFinalization() {
  const html=api.renderEmail(fixture,"data:image/png;base64,YmFrZWQ=");
  assert.match(html,/max-width:1000px/);assert.match(html,/height:500px/);assert.match(html,/border:0px double #aabbcc/);assert.match(html,/padding:0px/);assert.match(html,/font-family:Georgia, serif/);assert.match(html,/font-size:23px/);
  assert.match(html,/class="narrative-cell"/);assert.match(html,/class="photo-cell"/);assert.match(html,/class="city-row"/);
  assert.match(html,/Manually edited narrative &lt;script&gt;/);assert.doesNotMatch(html,/<script>|onerror=alert\(1\)>/);
  assert.doesNotMatch(html,/transform:|filter:|object-fit:/,"email consumes transformed pixels without relying on unsupported client CSS");
  assert.match(api.renderEmail(fixture),/rotate\(90deg\)/,"preview still applies source transformations");
  assert.match(api.plainText(fixture),/^Dallas\n\nManually edited narrative/);
  assert.match(api.plainText(fixture),/• Retain first bullet/);
  const snapshot=api.finalize(fixture,{cardId:"bbc1",personId:"p1",bookinRecordId:"b1",generatedAt:"2026-09-05T14:00:00Z"});
  assert.strictEqual(snapshot.arrestDateKey,"2026-09-05");assert.strictEqual(snapshot.recordId,"b1");assert.strictEqual(snapshot.status,"FINALIZED");
  assert(Object.isFrozen(snapshot));assert(Object.isFrozen(snapshot.layout));assert(Object.isFrozen(snapshot.content.bullets));
  const savedAgain=api.toCanonical(fixture,{existing:{cardId:"bbc1",finalizedSnapshot:snapshot}});
  assert.deepStrictEqual(clone(savedAgain.finalizedSnapshot),clone(snapshot),"editing a saved card preserves its prior finalized output");
  const changed=clone(fixture);changed.content.narrative="Later draft";assert.notStrictEqual(api.fingerprint(changed),snapshot.sourceFingerprint);
  assert.strictEqual(snapshot.content.narrative,fixture.content.narrative);
  changed.content=clone(fixture.content);changed.savedAt="2026-09-06";assert.strictEqual(api.fingerprint(changed),api.fingerprint(fixture),"save timestamp alone does not change presentation fingerprint");
  assert.throws(()=>api.finalize({fields:{baseballArrestDate:"2026-09-05"},content:{narrative:"Test",bullets:[]}},{}),/photo/);
}
async function transformedPhoto() {
  const calls=[];
  const ctx={filter:"none",fillRect(...args){calls.push(["fillRect",...args]);},save(){},restore(){},translate(...args){calls.push(["translate",...args]);},rotate(...args){calls.push(["rotate",...args]);},scale(...args){calls.push(["scale",...args]);},drawImage(image,...args){calls.push(["drawImage",...args]);}};
  const cropCalls=[];
  const cropCtx={filter:"none",drawImage(image,...args){cropCalls.push(args);}};
  const canvas={getContext(){return ctx;},toDataURL(type){assert.strictEqual(type,"image/png");return "data:image/png;base64,YmFrZWQ=";}};
  const crop={getContext(){return cropCtx;}};
  let created=0;
  class TestImage {constructor(){this.naturalWidth=400;this.naturalHeight=200;}set src(value){assert.strictEqual(value,fixture.photoDataUrl);this.onload();}}
  const rendered=await api.renderPhoto(fixture,undefined,{document:{createElement(tag){assert.strictEqual(tag,"canvas");return ++created===1?canvas:crop;}},Image:TestImage});
  assert.strictEqual(rendered,"data:image/png;base64,YmFrZWQ=");assert.strictEqual(canvas.width,400);assert.strictEqual(canvas.height,500);
  assert.deepStrictEqual(calls.find(c=>c[0]==="translate"),["translate",200,250]);
  assert.deepStrictEqual(calls.find(c=>c[0]==="scale"),["scale",-2,2]);
  assert.deepStrictEqual(cropCalls[0],[-150,0,1000,500],"object-fit cover crop is clipped before the image box is rotated");
  assert.deepStrictEqual(calls.find(c=>c[0]==="drawImage"),["drawImage",-200,-250,400,500]);
  assert.strictEqual(cropCtx.filter,"brightness(115%) contrast(125%)");
  await assert.rejects(api.renderPhoto(fixture,undefined,{document:{createElement(){return {getContext(){return null;}};}},Image:TestImage}),/canvas/);
}
(async()=>{sourceStateRoundTrip();sourceGeneratedContent();emailAndFinalization();await transformedPhoto();console.log("PASS Stage 6 Baseball Card contract: source-state roundtrip, source text, email settings, immutable finalization, transformed photo output");})().catch(error=>{console.error(error);process.exitCode=1;});
