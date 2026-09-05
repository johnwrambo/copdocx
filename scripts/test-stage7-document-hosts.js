"use strict";
// Uses the real history controller, registry and ledger reader with a minimal
// text-only DOM. This verifies behavior and host loading, not rendered browser QA.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {spawnSync} = require("child_process");
const ROOT = path.resolve(__dirname,"..");
const pipeline = ["functions/document-context.js","functions/document-registry.js","functions/document-fingerprints.js","functions/document-generation.js"];
const hosts = {
  "bookin.html":["functions/book-in.js"],
  "i200-form.html":["functions/warrant-issue.js"],
  "i205-form.html":["functions/warrant-issue.js"],
  "admin.html":["functions/arrest-roster.js"],
  "baseballcard.html":["functions/baseball-page.js"],
  "narrative.html":["functions/narratives/narrative-page.js"],
  "mobile-target-sheet.html":["functions/leads.js"],
  "cases.html":["functions/leads.js","functions/arrest-roster.js"],
  "case.html":["functions/leads.js"],
  "operation-brief.html":["functions/operations.js"],
  "map.html":["functions/map-markup.js"],
  "document-history.html":["functions/document-history.js"]
};
for (const [host,consumers] of Object.entries(hosts)) {
  const html = fs.readFileSync(path.join(ROOT,host),"utf8");
  const scripts = Array.from(html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/g),m => m[1]);
  let previous = -1;
  for (const file of pipeline) {
    assert.strictEqual(scripts.filter(src => src === file).length,1,host + " must load " + file + " exactly once");
    const index = scripts.indexOf(file);
    assert(index > previous,host + " document pipeline load order");
    previous = index;
  }
  for (const consumer of consumers) assert(scripts.indexOf(consumer) > previous,host + " must load document contracts before " + consumer);
}
class Element {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.listeners = {}; this.style = {}; this.value = ""; this._text = ""; this.parent = null; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(node => node.textContent).join(""); }
  set innerHTML(_) { throw new Error("History must render receipt/dependency data as text"); }
  appendChild(child) { child.parent = this; this.children.push(child); return child; }
  addEventListener(type,listener) { (this.listeners[type] ||= []).push(listener); }
  dispatch(type,event = {}) { (this.listeners[type] || []).forEach(listener => listener(Object.assign({preventDefault() {}},event))); }
  click() { this.clicked = true; this.dispatch("click"); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
}
const ids = Array.from(fs.readFileSync(path.join(ROOT,"document-history.html"),"utf8").matchAll(/\bid="([^"]+)"/g),m => m[1]);
const elements = Object.fromEntries(ids.map(id => [id,new Element("div")]));
const document = {body:new Element("body"),getElementById:id => elements[id] || null,createElement:tag => new Element(tag)};
const memory = new Map(),events = {},downloads = [],revoked = [];
const context = {document,Date,JSON,Number,Object,Array,String,Boolean,TextEncoder,Uint8Array,ArrayBuffer,Blob,
  localStorage:{getItem:key => memory.has(key) ? memory.get(key) : null,setItem:(key,value) => memory.set(key,value)},
  URL:{createObjectURL:blob => { downloads.push(blob); return "blob:synthetic-receipts"; },revokeObjectURL:url => revoked.push(url)},
  setTimeout:callback => callback(),addEventListener:(type,listener) => { (events[type] ||= []).push(listener); }};
context.window = context;
vm.createContext(context);
const run = file => require("./support/module-dependencies.js").loadScript(context, file);
pipeline.filter(file => !file.includes("fingerprints")).forEach(run);
const api = context.COPDoc.documents, key = api.storageKey;
const hash = "a".repeat(64);
const receipt = {generationId:"doc_test",documentType:'<img src=x onerror="alert(1)">',template:{id:"test",version:"1"},inputHash:hash,sourceFingerprint:hash,templateHash:hash,startedAt:"2026-09-05T00:00:00.000Z",sources:[{type:"PERSON",id:"<script>synthetic</script>",authority:"snapshot",revision:null}],status:"GENERATED",generatedAt:"2026-09-05T00:00:01.000Z",outputHash:hash,outputBytes:12,deliveries:[]};
memory.set(key,JSON.stringify({schema:key,version:1,revision:1,records:{doc_test:receipt}}));
run("functions/document-history.js");
assert.strictEqual(elements.documentHistoryBody.children.length,1);
assert(elements.documentHistoryBody.textContent.includes(receipt.documentType),"unknown receipt type rendered literally");
assert(elements.documentHistoryBody.textContent.includes(receipt.sources[0].id),"source ID appears literally in receipt details");
assert(elements.documentHistoryBody.textContent.includes("No delivery recorded"));
assert(elements.documentHistoryStatus.textContent.includes("1 generation receipts"));
assert.strictEqual(elements.documentHistoryBody.children[0].children[1].tagName,"TD");
assert(!elements.documentHistoryBody.children[0].children.some(node => node.tagName === "IMG" || node.tagName === "SCRIPT"));

elements.documentDependencyField.value = "person.dob";
elements.documentDependencySearch.dispatch("click");
const expected = api.registry.dependentsOf("person.dob");
assert.strictEqual(elements.documentDependencyResults.children.length,expected.length);
assert(expected.some(entry => entry.documentType === "bookin.combined-pdf"));
for (let index = 0; index < expected.length; index += 1) {
  const text = elements.documentDependencyResults.children[index].textContent;
  assert(text.includes(expected[index].title));
  for (const dependency of expected[index].dependencies) {
    assert(text.includes(dependency.field + " — " + dependency.authority + " (" + dependency.citation + ")"),"UI must use actual field/authority/citation names");
  }
  assert(!text.includes("undefined"));
}
elements.documentDependencyField.value = "person.immigration.baseballCards[2].finalizedSnapshot.content";
let prevented = false;
elements.documentDependencyField.dispatch("keydown",{key:"Enter",preventDefault() { prevented = true; }});
assert(prevented);
assert(elements.documentDependencyResults.textContent.includes("Daily arrest report email"));
elements.documentDependencyField.value = "unknown.noConsumers";
elements.documentDependencySearch.dispatch("click");
assert.strictEqual(elements.documentDependencyResults.children.length,0);
assert(elements.documentDependencyStatus.textContent.includes("no match does not prove"));
elements.documentDependencyField.value = " ";
elements.documentDependencySearch.dispatch("click");
assert.strictEqual(elements.documentDependencyStatus.textContent,"Enter a field path.");

elements.documentHistoryExport.dispatch("click");
assert.strictEqual(downloads.length,1);
assert.strictEqual(downloads[0].type,"application/json");
assert.strictEqual(revoked[0],"blob:synthetic-receipts");
assert(elements.documentHistoryStatus.textContent.includes("submitted to the browser"));
assert.strictEqual(document.body.children.length,0,"temporary download link is removed");
memory.set(key,"broken-json");
events.storage[0]({key});
assert(elements.documentHistoryStatus.textContent.includes("invalid JSON"));
assert.strictEqual(elements.documentHistoryBody.children.length,0,"unreadable history clears stale rows");
memory.delete(key);
events.storage[0]({key:null});
assert(elements.documentHistoryStatus.textContent.includes("No generation receipts yet"));
if (!process.argv.includes("--skip-fingerprints")) {
  const checked = spawnSync(process.execPath,[path.join(__dirname,"build-document-fingerprints.js"),"--check"],{cwd:ROOT,encoding:"utf8"});
  assert.strictEqual(checked.status,0,checked.stdout + checked.stderr);
}
console.log("Stage 7 document hosts: 11 emitting pages plus history load order, text-safe real history rendering, dependency lookup, export, storage refresh and " + (process.argv.includes("--skip-fingerprints") ? "fingerprint check explicitly deferred" : "pinned source fingerprint check") + " passed.");
