"use strict";
// Production editor/controller + model boundary, isolated browser storage and DOM.
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const {ROOT,createMemoryStorage,createMinimalDocument,loadModelTab,loadScript,quietConsole}=require("./support/copdoc-vm-harness");
const WS="copdocx.store.v1", PK="alien-book-in.saved-records.v1";
const clone=x=>JSON.parse(JSON.stringify(x));
const decode=x=>String(x||"").replace(/<[^>]+>/g,"").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'");
function node(tag="div") {
  const listeners={};let html="";
  const n={tagName:tag.toUpperCase(),dataset:{},style:{setProperty(k,v){this[k]=v;}},classList:{toggle(){},add(){},remove(){}},children:[],value:"",checked:false,options:[],selectedIndex:-1,hidden:false,
    addEventListener(t,f){(listeners[t]||(listeners[t]=[])).push(f);},emit(t,e={}){return Promise.all((listeners[t]||[]).map(f=>f({...e,target:e.target||n,preventDefault(){},stopPropagation(){}})));},
    appendChild(child){if(child.parentNode)child.remove();this.children.push(child);child.parentNode=this;if(this.tagName==="SELECT")this.options.push(child);return child;},
    insertBefore(child,before){if(child.parentNode)child.remove();this.children.splice(this.children.indexOf(before),0,child);child.parentNode=this;},
    remove(){if(this.parentNode)this.parentNode.children.splice(this.parentNode.children.indexOf(this),1);this.parentNode=null;},focus(){},setAttribute(k,v){this[k]=v;},getAttribute(k){return this[k]||"";},removeAttribute(k){delete this[k];},getBoundingClientRect(){return {width:320,height:570};},setPointerCapture(){},closest(){return null;},
    querySelectorAll(sel){
      if(sel===".criminal-history-row")return this.children;
      if(sel==="li"||sel===".narrative-cell li")return [...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map(m=>({textContent:decode(m[1])}));
      if(sel==="p")return [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map(m=>({textContent:decode(m[1])}));
      return [];
    },querySelector(sel){
      const field=sel.match(/data-field="([^"]+)"/);if(field)return this.fields&&this.fields[field[1]]||null;
      if(sel===".criminal-history-row")return this.children[0]||null;
      if(sel===".arrest-card")return /class="arrest-card"/.test(html)?{}:null;
      if(sel===".photo-cell img")return null;
      const t=sel===".narrative-cell p"||sel==="p"?"p":sel===".narrative-cell h2"||sel==="h2"?"h2":"";
      const m=t&&html.match(new RegExp("<"+t+"\\b[^>]*>([\\s\\S]*?)</"+t+">"));return m?{textContent:decode(m[1])}:null;
    }
  };
  Object.defineProperties(n,{innerHTML:{get(){return html;},set(v){html=String(v);this.children=[];this.fields={};for(const m of html.matchAll(/data-field="([^"]+)"/g))this.fields[m[1]]=node("input");if(tag==="template")this.content={childNodes:[]};}},textContent:{get(){return decode(html);},set(v){html=String(v);}},innerText:{get(){return decode(html);}},previousElementSibling:{get(){return this.parentNode&&this.parentNode.children[this.parentNode.children.indexOf(this)-1];}},nextElementSibling:{get(){return this.parentNode&&this.parentNode.children[this.parentNode.children.indexOf(this)+1];}}});return n;
}
function dom(){const doc=createMinimalDocument("baseballcard"),ids={};const html=fs.readFileSync(path.join(ROOT,"baseballcard.html"),"utf8");for(const m of html.matchAll(/<(input|select|button|div|p|img|output)\b[^>]*id="([^"]+)"[^>]*>/g)){const el=ids[m[2]]=node(m[1]);const val=m[0].match(/value="([^"]*)"/);if(val)el.value=val[1];}doc.getElementById=id=>ids[id]||null;doc.createElement=tag=>node(tag);return {doc,ids};}
function initial(){const person={personId:"p_card",name:{firstName:"Canonical",lastName:"PERSON"},gender:"Female",citizenship:"Mexico",immigration:{alienNumber:"123456789",firstDeportationDate:"2000-01-01"},criminal:{hasForeignWarrants:false},arrests:[{arrestId:"a_card",bookinRecordId:"b_card",arrestDate:"2026-09-05"}]};return {[WS]:{schema:WS,people:{p_card:person},leads:{l_card:{leadId:"l_card",subjectPersonId:"p_card",person:clone(person),meta:{status:"committed",updatedAt:"2026-09-05T12:00:00Z"}}},encounters:{},investigations:{},operations:{},vehicles:{},locations:{},businesses:{},entities:{},associations:{}},[PK]:[{id:"b_card",personId:"p_card",leadId:"l_card",arrestId:"a_card",formState:{}}]};}
function runtime(storage=createMemoryStorage(initial())){
  const {doc,ids}=dom(),t=loadModelTab(storage,{document:doc,console:quietConsole(),location:{search:"?leadId=l_card&recordId=b_card"}});let mediaIndex=0;
  const removed=[],media=new Map();t.context.COPDoc.media={async save(input){const mediaId="photo_"+(++mediaIndex);media.set(mediaId,input);return {mediaId};},async blob(id){if(!media.has(id))throw new Error("missing");return {blob:media.get(id).original,mime:"image/png"};},async remove(id){removed.push(id);media.delete(id);}};
  t.context.FileReader=class {readAsDataURL(blob){blob.arrayBuffer().then(b=>{this.result="data:image/png;base64,"+Buffer.from(b).toString("base64");this.onload();});}};
  t.context.formatAlienNumber=x=>x;loadScript(t.context,"functions/baseball-card-contract.js");loadScript(t.context,"functions/baseballcard.js");
  let source=fs.readFileSync(path.join(ROOT,"functions/baseball-page.js"),"utf8");source=source.replace("  global.persistBaseballCard = persistBaseballCard;","  global.__cardUI={setPhoto:setPhoto,hydrateSavedCard:hydrateSavedCard,preparedEmailCardHtml:preparedEmailCardHtml};\n  global.persistBaseballCard = persistBaseballCard;");vm.runInContext(source,t.context);
  doc._dispatch("DOMContentLoaded");return {...t,doc,ids,removed,media};
}
function saved(r){return r.model.store.getPerson("p_card").immigration.baseballCards[0];}
(async()=>{
  const r=runtime(),api=r.context.COPDoc.baseball;
  r.ids.firstName.value="Presentation only";r.ids.firstDeportationDate.value="2024-02-03";r.ids.foreignWarrants.value="yes";r.ids.foreignWarrantCountry.value="Canada";
  r.context.__cardUI.setPhoto("data:image/png;base64,YWJj");
  r.ids.bbPhotoZoom.value="2.25";r.ids.bbPhotoX.value="72";r.ids.bbPhotoY.value="35";r.ids.bbPhotoRotation.value="22";r.ids.bbPhotoFlip.checked=true;r.ids.bbPhotoBrightness.value="122";r.ids.bbPhotoContrast.value="89";
  r.ids.bbStyleWidth.value="1240";r.ids.bbStyleLine.value="0";r.ids.bbStyleLineStyle.value="double";r.ids.bbStylePadding.value="31";r.ids.bbStyleHeaderHeight.value="64";
  const state=r.context.getBaseballCardState();state.criminalHistory=[{charge:"New charge",convictionDate:"2025-01-01",jurisdictionType:"City",jurisdiction:"Dallas",state:"TX",court:"",sourceId:"original-row",customFlag:false},{charge:"Old charge",convictionDate:"2020-02-01",jurisdictionType:"County",jurisdiction:"Tarrant",state:"TX",court:""}];state.content={narrative:"Manually edited narrative.",heading:"Custom review heading",bullets:["User bullet."]};state.contentEdited=true;
  r.context.hydrateBaseballCardState(state);
  assert.strictEqual(await r.context.persistBaseballCard(),true,r.ids.baseballCardStatus.textContent);
  let card=saved(r);assert.strictEqual(card.state.fields.baseballFirstName,"Presentation only");assert.strictEqual(card.state.layout.lineWidthPx,0);assert.strictEqual(card.state.layout.contentPaddingPx,31);assert.strictEqual(card.state.photoAdjustments.zoom,2.25);assert.strictEqual(card.state.photoAdjustments.flipX,true);assert.strictEqual(card.state.photoDataUrl,"");assert.ok(card.photoMediaId);assert.strictEqual(card.content.narrative,"Manually edited narrative.");assert.strictEqual(card.state.criminalHistory[0].jurisdictionType,"City");assert.strictEqual(card.state.criminalHistory[0].sourceId,"original-row");assert.strictEqual(card.state.criminalHistory[0].customFlag,false);
  const canonical=r.model.store.getPerson("p_card");assert.strictEqual(canonical.name.firstName,"Canonical");assert.strictEqual(canonical.immigration.firstDeportationDate,"2000-01-01");assert.strictEqual(canonical.criminal.hasForeignWarrants,false,"presentation warrants never rewrite canonical Person");
  await r.context.hydrateSavedBaseballCard(card);
  assert.strictEqual(r.ids.bbStyleLine.value,0);assert.strictEqual(r.ids.bbPhotoRotation.value,22);assert.strictEqual(r.context.getLiveBaseballCardPhoto(),"data:image/png;base64,YWJj");
  r.ids.bbPhotoZoom.value="1.8";await r.ids.bbPhotoZoom.emit("input");assert.ok(r.ids.baseballCardEditor.innerHTML.includes("Manually edited narrative."));
  r.ids.firstName.value="Changed source";r.context.createBaseballText();assert.ok(r.ids.baseballCardEditor.innerHTML.includes("Manually edited narrative."),"field changes preserve manual text");
  r.context.sortBaseballCriminalHistory("asc");assert.strictEqual(r.context.getBaseballCardState().criminalHistory[0].charge,"Old charge");r.context.sortBaseballCriminalHistory("desc");assert.strictEqual(r.context.getBaseballCardState().criminalHistory[0].charge,"New charge");
  await r.ids.bbPhotoFrame.emit("keydown",{key:"ArrowRight",shiftKey:true});assert.strictEqual(r.context.getBaseballCardState().photoAdjustments.positionX,82);
  assert.strictEqual(await r.context.persistBaseballCard({finalize:true}),true,r.ids.baseballCardStatus.textContent);card=saved(r);assert.strictEqual(card.finalizedSnapshot.status,"FINALIZED");assert.strictEqual(card.arrestOfDay.date,"2026-09-05");const frozen=JSON.stringify(card.finalizedSnapshot);
  const edited=r.context.getBaseballCardState();edited.content.narrative="Next draft only";r.context.hydrateBaseballCardState(edited);assert.strictEqual(await r.context.persistBaseballCard(),true,r.ids.baseballCardStatus.textContent);assert.strictEqual(JSON.stringify(saved(r).finalizedSnapshot),frozen,"saving a draft never rewrites finalized report output");
  let renderInput;api.renderPhoto=async s=>{renderInput=clone(s);return "data:image/png;base64,YmFrZWQ=";};const email=await r.context.__cardUI.preparedEmailCardHtml();assert.ok(email.includes("YmFrZWQ="));assert.ok(!email.includes("transform:"));assert.strictEqual(renderInput.photoAdjustments.positionX,82);
  r.ids.bbStyleLine.value="0";await r.ids.bbStyleSaveDefault.emit("click");assert.strictEqual(r.storage.json("copdocx.baseball.card-style.v1").lineWidthPx,0,"saving defaults preserves a borderless card");
  r.context.__cardUI.setPhoto("data:image/png;base64,bmV3");assert.strictEqual(await r.context.persistBaseballCard(),true,r.ids.baseballCardStatus.textContent);assert.ok(!r.removed.includes("photo_1"),"a finalized snapshot keeps its original Media when the draft photo changes");
  const latest=r.model.store.getLead("l_card");latest.person.immigration.baseballCards[0].content.narrative="Other tab edit";assert.ok(r.model.store.saveLead(latest,{mode:"commit"}).ok);const before=r.storage.raw(WS);assert.strictEqual(await r.context.persistBaseballCard(),false);assert.strictEqual(r.storage.raw(WS),before);
  const f=runtime();f.context.__cardUI.setPhoto("data:image/png;base64,YWJj");const beforeFailure=f.storage.raw(WS);f.storage.failNext(WS);assert.strictEqual(await f.context.persistBaseballCard(),false);assert.strictEqual(f.storage.raw(WS),beforeFailure);assert.deepStrictEqual(f.removed,["photo_1"],"failed canonical save rolls back newly allocated photo");
  const v=runtime();v.context.__cardUI.setPhoto("data:image/png;base64,YWJj");v.context.COPDoc.media.save=async input=>{const data=v.storage.json(WS);data.people.p_card.arrests[0].voidedAt="2026-09-05T14:00Z";data.leads.l_card.person.arrests[0].voidedAt="2026-09-05T14:00Z";v.storage.setRaw(WS,data);return {mediaId:"late_photo"};};assert.strictEqual(await v.context.persistBaseballCard(),false);assert.ok(!(v.model.store.getPerson("p_card").immigration.baseballCards || []).length);assert.deepStrictEqual(v.removed,["late_photo"],"a void while Media saves blocks the card and removes new Media");
  const concurrent=runtime();concurrent.context.__cardUI.setPhoto("data:image/png;base64,YWJj");concurrent.context.COPDoc.media.save=async()=>{const lead=concurrent.model.store.getLead("l_card");lead.person.immigration.baseballCards=[concurrent.model.createBaseballCard({cardId:"other_card",bookinRecordId:"b_card",arrestDate:"2026-09-05",text:"Other tab card"})];assert.ok(concurrent.model.store.saveLead(lead,{mode:"commit"}).ok);return {mediaId:"conflicting_photo"};};assert.strictEqual(await concurrent.context.persistBaseballCard(),false);assert.strictEqual(concurrent.model.store.getPerson("p_card").immigration.baseballCards.length,1,"concurrent first saves cannot create duplicate cards for one booking");assert.deepStrictEqual(concurrent.removed,["conflicting_photo"]);
  console.log("STAGE6_BASEBALL_UI_PASSED structured save/reopen, crop/layout, history, manual content, immutable finalization, clipboard renderer, stale/void/media rollback.");
})().catch(error=>{console.error(error);process.exitCode=1;});
