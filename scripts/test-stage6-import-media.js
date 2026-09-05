"use strict";
const assert = require("assert");
const crypto = require("crypto");
const { createMemoryStorage, loadModelTab, loadScript, quietConsole } = require("./support/copdoc-vm-harness.js");
const WS="copdocx.store.v1", KEY="copdocx.import-transactions.v1", SETTINGS="copdocx.settings.v1";
const PNG="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=";
const bytes=Buffer.from(PNG,"base64"), sha=crypto.createHash("sha256").update(bytes).digest("hex");
const copy=value=>JSON.parse(JSON.stringify(value));
function ok(result) {assert(result&&result.ok,result&&result.error||"Operation must succeed");return result;}
function fixture() {
  const before={schema:WS,currentLeadId:"",people:{p_media:{personId:"p_media",name:{firstName:"Synthetic",lastName:"MEDIA"},immigration:{baseballCards:[]},arrests:[]}},leads:{},encounters:{},investigations:{},operations:{},vehicles:{},locations:{},businesses:{},entities:{},associations:{}};
  const after=copy(before);after.people.p_media.immigration.baseballCards=[{cardId:"card_media",bookinRecordId:"booking_media",photoMediaId:"m_import",content:{narrative:"Synthetic imported card",heading:"",bullets:[]}}];
  const storage=createMemoryStorage({[WS]:JSON.stringify(before),[SETTINGS]:'{ "before": true }'});
  const loaded=loadModelTab(storage,{console:quietConsole()});loaded.context.crypto=crypto.webcrypto;
  loadScript(loaded.context,"functions/workspace-config.js");
  loadScript(loaded.context,"functions/model/media.js");
  loadScript(loaded.context,"functions/import-workflow.js");
  const plan={ok:true,changes:[{key:WS,before:storage.raw(WS),after:JSON.stringify(after)},{key:SETTINGS,before:storage.raw(SETTINGS),after:JSON.stringify({imported:true})}],mediaPlans:[{mediaId:"m_import",ownerType:"PERSON",ownerId:"p_media",dataUrl:"data:image/png;base64,"+PNG}],stats:{added:1}};
  storage.resetWriteHistory();
  return {...loaded,storage,plan,media:loaded.context.COPDoc.media,get api(){return this.context.COPDoc.importWorkflow;}};
}
function reloadWorkflow(r){loadScript(r.context,"functions/import-workflow.js");}
async function missing(media,id){try{await media.get(id);return false;}catch(e){if(e.code==="NOT_FOUND")return true;throw e;}}
function bundle(r,id,owner){return {meta:r.model.createMedia({mediaId:id,owner:{type:"PERSON",id:owner||"p_media"},mediaClass:"photo",kind:"subject",mime:"image/png",bytes:bytes.length,sha256:sha,roles:["original"]}),blobs:[{role:"original",mime:"image/png",bytes:bytes.length,base64:PNG}]};}
async function assertPhoto(r,id){const meta=await r.media.get(id);assert.strictEqual(meta.owner.id,"p_media");assert.strictEqual(meta.mime,"image/png");assert.strictEqual(meta.bytes,bytes.length);assert.strictEqual(meta.sha256,sha);const part=await r.media.blob(id,"original");assert.strictEqual(part.mime,"image/png");const payload=part.blob&&typeof part.blob.arrayBuffer==="function"?await part.blob.arrayBuffer():part.blob;assert.strictEqual(Buffer.from(payload).toString("base64"),PNG);}
async function importAndResume() {
  const r=fixture();const result=ok(await r.api.apply(r.plan));await assertPhoto(r,"m_import");
  r.plan.changes.forEach(change=>assert.strictEqual(r.storage.raw(change.key),change.after));
  assert.strictEqual((await r.media.listAll()).length,1);
  const before=r.storage.dump();reloadWorkflow(r);ok(await r.api.resume(result.transactionId));assert.deepStrictEqual(r.storage.dump(),before);assert.strictEqual((await r.media.listAll()).length,1,"completed retry never creates another Media row");
  const rerun=copy(r.plan);rerun.changes=[];ok(await r.api.apply(rerun));assert.strictEqual((await r.media.listAll()).length,1,"same imported ID and bytes reuse the saved photo");
}
async function failureBeforeAndAfterMedia() {
  for(const afterWrite of [false,true]) {
    const r=fixture(),method=typeof r.media.importExactBundle==="function"?"importExactBundle":"importBundle",real=r.media[method];let once=true;
    r.media[method]=async function(items){if(!once)return real(items);once=false;if(!afterWrite)throw new Error("Injected Media write failure");const result=await real(items);r.storage.failNext(KEY);return result;};
    const failed=await r.api.apply(r.plan);assert.strictEqual(failed.ok,false);assert(failed.transactionId,"Media writes require a durable pending command");
    r.plan.changes.forEach(change=>assert.strictEqual(r.storage.raw(change.key),change.before,"Media failure happens before domain writes"));
    assert.strictEqual(await missing(r.media,"m_import"),!afterWrite);
    r.media[method]=real;reloadWorkflow(r);ok(await r.api.resume(failed.transactionId));await assertPhoto(r,"m_import");assert.strictEqual((await r.media.listAll()).length,1);
    ok(await r.api.resume(failed.transactionId));assert.strictEqual((await r.media.listAll()).length,1);
  }
}
async function rollbackOnlyOwnedMedia() {
  const r=fixture();r.storage.failNext(SETTINGS);
  const failed=await r.api.apply(r.plan);assert.strictEqual(failed.ok,false);await assertPhoto(r,"m_import");
  assert.strictEqual(r.storage.raw(WS),r.plan.changes[0].after,"fixture failed after workspace accepted the photo reference");
  reloadWorkflow(r);ok(await r.api.rollback(failed.transactionId));r.plan.changes.forEach(change=>assert.strictEqual(r.storage.raw(change.key),change.before));
  assert(await missing(r.media,"m_import"),"rollback removes this import's new photo despite its own journal references");
  ok(await r.api.rollback(failed.transactionId));assert(await missing(r.media,"m_import"));
  const reused=fixture();await reused.media.importBundle([bundle(reused,"m_import")]);reused.storage.failNext(SETTINGS);
  const reusedFailure=await reused.api.apply(reused.plan);assert.strictEqual(reusedFailure.ok,false);ok(await reused.api.rollback(reusedFailure.transactionId));await assertPhoto(reused,"m_import");
}
async function exactIdAndConflicts() {
  const r=fixture();await r.media.importBundle([bundle(r,"m_existing")]);
  ok(await r.api.apply(r.plan));await assertPhoto(r,"m_existing");await assertPhoto(r,"m_import");
  assert.strictEqual((await r.media.listAll()).length,2,"an import's explicit referenced ID is honored even when content already has another identity");
  const conflict=fixture();await conflict.media.importBundle([bundle(conflict,"m_import","p_other")]);const before=conflict.storage.dump();
  const failed=await conflict.api.apply(conflict.plan);assert.strictEqual(failed.ok,false);assert.match(failed.error,/owner|object/i);assert.deepStrictEqual(conflict.storage.dump(),before,"owner conflicts block before any domain or journal write");
}
async function rollbackRetainsExternalReferences() {
  const r=fixture();r.storage.failNext(SETTINGS);const failed=await r.api.apply(r.plan);assert.strictEqual(failed.ok,false);
  r.storage.setRaw("copdocx.map.icons.v1",JSON.stringify({later:{photoMediaId:"m_import"}}));
  const blocked=await r.api.rollback(failed.transactionId);assert.strictEqual(blocked.ok,false,"rollback cannot delete a photo referenced outside its own recovery command");await assertPhoto(r,"m_import");
  r.storage.storage.removeItem("copdocx.map.icons.v1");reloadWorkflow(r);ok(await r.api.rollback(failed.transactionId));assert(await missing(r.media,"m_import"));
}
async function rejectConflictingExistingMetadata() {
  for(const mutate of [row=>{row.meta.mime="image/jpeg";},row=>{row.meta.sha256="0".repeat(64);},row=>{row.blobs[0].mime="image/jpeg";},row=>{row.blobs[0].bytes+=1;}]) {
    const r=fixture(),existing=bundle(r,"m_import");mutate(existing);await r.media.importBundle([existing]);const before=r.storage.dump();
    const result=await r.api.apply(r.plan);assert.strictEqual(result.ok,false,"same bytes do not excuse conflicting existing Media type/hash/length metadata");assert.deepStrictEqual(r.storage.dump(),before);
  }
}
async function rejectTamperedBundles() {
  for(const mutate of [
    row=>{row.meta.sha256="0".repeat(64);},
    row=>{row.meta.bytes+=1;},
    row=>{row.blobs[0].bytes+=1;},
    row=>{row.meta.mime="image/jpeg";},
    row=>{row.blobs[0].mime="image/jpeg";},
    row=>{row.blobs.push(copy(row.blobs[0]));},
    row=>{row.meta.ownerKey="PERSON:p_wrong";},
    row=>{row.meta.ownerSha="PERSON:p_wrong:"+sha;}
  ]) {
    const r=fixture(),raw=bundle(r,"m_import");mutate(raw);r.plan.mediaPlans=[raw];const before=r.storage.dump();
    const result=await r.api.apply(r.plan);assert.strictEqual(result.ok,false,"tampered bytes/type/hash/role/owner metadata cannot be accepted");assert.deepStrictEqual(r.storage.dump(),before);assert.strictEqual((await r.media.listAll()).length,0);
  }
}
(async()=>{await importAndResume();await failureBeforeAndAfterMedia();await rollbackOnlyOwnedMedia();await exactIdAndConflicts();await rollbackRetainsExternalReferences();await rejectConflictingExistingMetadata();await rejectTamperedBundles();console.log("PASS Stage 6 import Media: real module, verified bytes/owner, failure recovery, restart retry, exact-ID import, owned rollback, external references, tamper rejection");})().catch(error=>{console.error(error);process.exitCode=1;});
