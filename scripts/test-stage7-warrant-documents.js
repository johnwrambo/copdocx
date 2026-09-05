"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(ROOT, file), "utf8");

function harness(type, options = {}) {
  const log = { captures: [], runs: [], fills: [], downloads: [], saves: [], media: [], attachments: [], deliveries: [], status: [] };
  const nodes = {};
  const storage = new Map();
  const initial = {
    fileNo: "A000111222", issueDate: "09/05/2026", issuingOfficer: "of1",
    officerTitle: "Officer", issuingOffice: "Example office", entryPlace: "Example port",
    entryDate: "08/01/2026", inaLaw: "Example INA", determination: "Example determination",
    nameOfAlien: "", dateOfService: "09/06/2026", serviceLanguage: "English", interpreter: "Interpreter 17"
  };
  Object.keys(initial).forEach(id => { nodes[id] = { value: initial[id] }; });
  ["orderIJ", "basisCharging"].forEach(id => { nodes[id] = { checked: true }; });
  const person = { personId: "p1", objectRevision: 8, name: { lastName: "CURRENT", firstName: "Casey" }, warrants: [], immigration: { alienNumber: "000111222" } };
  const lead = { leadId: "l1", meta: { status: "committed", updatedAt: "2026-09-05T00:00:00.000Z" }, person: Object.assign({}, person, { name: { lastName: "STALE", firstName: "Casey" } }) };
  const templateBytes = new Uint8Array([37, 80, 68, 70, 45, 49]).buffer;
  let serial = 0;
  const c = {
    document: { body: { getAttribute: key => key === "data-form-type" ? type : "" }, getElementById: id => nodes[id] || null, readyState: "complete", addEventListener() {} },
    location: { search: "?id=l1", href: "" },
    localStorage: { getItem: key => key === "copdoc.admin.v1" ? JSON.stringify({ officers: [{ officerId: "of1", firstName: "Jordan", lastName: "EXAMPLE", role: "Officer" }] }) : (storage.get(key) || null), setItem(key, value) { storage.set(key, value); } },
    crypto: require("crypto").webcrypto, TextEncoder,
    navigator: { locks: { request: async (name, options, callback) => callback() } },
    fetch: async () => { log.fetches = (log.fetches || 0) + 1; return { ok: true, arrayBuffer: async () => templateBytes }; },
    Blob, URLSearchParams, Uint8Array, ArrayBuffer, Promise,
    console: { warn() {}, log() {} },
    COPDoc: {
      setAppBarStatus: (message, flags) => log.status.push({ message, flags }),
      model: {
        store: { loadFromDisk() {}, getLead: () => JSON.parse(JSON.stringify(lead)), getPerson: () => options.legacyPerson ? null : JSON.parse(JSON.stringify(person)), saveLead: row => { log.saves.push(row); return options.saveFail ? { ok: false, error: "save rejected" } : { ok: true }; } },
        subjectOf: row => row.person, formatPersonLabel: row => row.name.lastName + ", " + row.name.firstName,
        newId: prefix => prefix + (++serial), createWarrant: row => row, nowIso: () => "2026-09-05T00:00:00.000Z"
      },
      media: { save: async row => { log.media.push(row); return { mediaId: "media1" }; } }
    }
  };
  c.window = c;
  c.globalThis = c;
  vm.createContext(c);
  ["functions/pdf/i200-map.js", "functions/pdf/i205-map.js", "functions/pdf/fill-warrant.js", "functions/document-context.js"].forEach(file => vm.runInContext(read(file), c));
  const capture = c.COPDoc.documents.captureContext;
  Object.assign(c.COPDoc.documents, {
    captureContext: opts => { const ctx = capture(opts); log.captures.push(ctx); return ctx; },
    generate: async opts => {
      log.runs.push(opts);
      if (options.generateFail) throw new Error("receipt storage rejected");
      return { artifact: await opts.render(opts.context), record: { generationId: "gen1" } };
    },
    attachMedia: async (id, mediaId) => log.attachments.push({ id, mediaId }),
    recordDelivery: async (id, event) => log.deliveries.push({ id, event })
  });
  if (options.realLedger) {
    ["functions/document-registry.js", "functions/document-fingerprints.js", "functions/document-generation.js"].forEach(file => vm.runInContext(read(file), c));
  }
  c.COPDoc.pdf.fillWarrantPdf = async (url, mapped, bytes) => { log.fills.push({ url, mapped, bytes }); return new Uint8Array([80, 68, 70]); };
  c.COPDoc.pdf.downloadBytes = (filename, bytes) => log.downloads.push({ filename, bytes });
  if (options.missingApi) delete c.COPDoc.documents.generate;
  vm.runInContext(read("functions/warrant-issue.js"), c);
  return { c, log, nodes, options, templateBytes };
}

async function main() {
  const i205 = harness("I-205");
  const first = i205.c.issueWarrant();
  const concurrent = i205.c.issueWarrant();
  assert.strictEqual(first, concurrent, "one active issuance prevents duplicate warrant IDs and writes");
  i205.nodes.entryPlace.value = "changed while PDF loads";
  await first;
  const run = i205.log.runs[0];
  assert.strictEqual(run.documentType, "warrant.i205");
  assert.strictEqual(run.context.entities.person.name.lastName, "CURRENT", "registry Person overrides stale embedded Lead person");
  assert.strictEqual(run.context.input.values.entryPlace, "Example port", "render uses captured draft values");
  assert(Object.isFrozen(run.context.input.mapped.text));
  assert.strictEqual(run.context.generatingOfficerId, "of1");
  assert(run.context.sources.some(row => row.type === "WarrantForm" && row.authority === "draft"));
  assert.strictEqual(i205.log.fills[0].bytes, run.templateContent, "receipt and PDF renderer use identical fetched template bytes");
  assert.strictEqual(i205.log.fetches, 1);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(i205.log.fills[0].mapped)), {
    text: {
      "File No": "A000111222", "Date": "09/05/2026", "Full name of alien": "CURRENT, Casey",
      "Place of entry": "Example port", "Date of entry": "08/01/2026", "Title of immigration officer": "Officer",
      "Date and office location": "09/05/2026, Example office", "INA LAW": "Example INA"
    },
    checkboxes: {
      "an immigration judge in exclusion deportation or removal proceedings": true,
      "a designated official": false, "the Board of Immigration Appeals": false,
      "a United States District or Magistrate Court Judge": false
    }
  }, "golden I205 mapping preserves selected order without touching execution or signature widgets");
  assert.strictEqual(i205.log.saves.length, 1);
  assert.strictEqual(i205.log.saves[0].person.warrants[0].documentGenerationId, "gen1");
  assert.strictEqual(i205.log.saves[0].person.warrants[0].mediaId, "media1");
  assert.strictEqual(i205.log.attachments[0].mediaId, "media1");
  assert.deepStrictEqual(i205.log.deliveries.map(row => [row.event.method, row.event.status]), [["save", "SUCCEEDED"], ["download", "SUBMITTED"]]);

  const i200 = harness("I-200");
  await i200.c.downloadWarrantPdf();
  assert.strictEqual(i200.log.runs[0].documentType, "warrant.i200");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(i200.log.fills[0].mapped)), {
    text: {
      "File No": "A000111222", "Date": "09/05/2026",
      "is removable from the United States  This determination is based upon": "Example determination",
      "Printed Name and Title of Authorized Immigration Officer": "EXAMPLE, Jordan, Officer",
      "Location": "Example office", "Name of Alien": "CURRENT, Casey", "Date of Service": "09/06/2026",
      "Language": "English", "Name or Number of Interpreter if applicable": "Interpreter 17"
    },
    checkboxes: {
      "the execution of a charging document to initiate removal proceedings against the subject": true,
      "the pendency of ongoing removal proceedings against the subject": false,
      "the failure to establish admissibility subsequent to deferred inspection": false,
      "biometric confirmation of the subjects identity and a records check of federal": false,
      "statements made voluntarily by the subject to an immigration officer andor other": false
    }
  }, "golden I200 mapping preserves service fields and leaves signatures untouched");
  assert.strictEqual(i200.log.saves.length, 0, "download-only does not issue a warrant");
  assert.strictEqual(i200.log.media.length, 0);
  assert.strictEqual(i200.log.downloads.length, 1);

  const failed = harness("I-205", { saveFail: true });
  await failed.c.issueWarrant();
  assert.strictEqual(failed.log.downloads.length, 0);
  assert.deepStrictEqual(failed.log.deliveries.map(row => row.event.status), ["FAILED"], "failed issuance remains distinct from successful byte generation");
  const blocked = harness("I-205", { generateFail: true });
  await blocked.c.issueWarrant();
  assert.strictEqual(blocked.log.saves.length, 0);
  assert.strictEqual(blocked.log.media.length, 0);
  assert.strictEqual(blocked.log.downloads.length, 0, "no unrecorded PDF escapes a failed generation gate");
  blocked.options.generateFail = false;
  await blocked.c.issueWarrant();
  assert.strictEqual(blocked.log.downloads.length, 1, "failed attempt releases the in-flight guard");
  const missing = harness("I-200", { missingApi: true });
  await missing.c.issueWarrant();
  assert.strictEqual(missing.log.fetches, undefined);
  assert(missing.log.status.some(row => /unavailable/.test(row.message)));
  const legacy = harness("I-200", { legacyPerson: true });
  await legacy.c.downloadWarrantPdf();
  assert(legacy.log.runs[0].context.sources.some(row => row.type === "Person" && row.authority === "snapshot"), "legacy embedded Person provenance is explicit");

  // Issuance is a domain commit. Delivery-history trouble after that commit
  // must never invite a second warrant or suppress the generated PDF.
  for (const brokenMethod of ["save", "download"]) {
    const issued = harness("I-205");
    const originalDelivery = issued.c.COPDoc.documents.recordDelivery;
    issued.c.COPDoc.documents.recordDelivery = async (id, event) => {
      if (event.method === brokenMethod) throw new Error("delivery ledger quota");
      return originalDelivery(id, event);
    };
    await issued.c.issueWarrant();
    assert.strictEqual(issued.log.saves.length, 1);
    assert.strictEqual(issued.log.downloads.length, 1);
    assert.strictEqual(issued.c.location.href, "case.html?id=l1");
    assert.match(issued.log.status.at(-1).message, /Issued I-205/);
    assert.match(issued.log.status.at(-1).message, /history annotation could not be saved/);
    issued.c.COPDoc.documents.recordDelivery = originalDelivery;
    await issued.c.issueWarrant();
    assert.strictEqual(issued.log.saves.length, 1, "a completed issuance cannot be repeated by retrying the old form");
    assert.strictEqual(issued.log.downloads.length, 1);
  }
  const downloadRejected = harness("I-200");
  downloadRejected.c.COPDoc.pdf.downloadBytes = () => { throw new Error("download blocked"); };
  await downloadRejected.c.issueWarrant();
  assert.strictEqual(downloadRejected.log.saves.length, 1);
  assert.strictEqual(downloadRejected.c.location.href, "case.html?id=l1");
  assert.match(downloadRejected.log.status.at(-1).message, /Issued I-200.*download could not be started/);
  assert.deepStrictEqual(downloadRejected.log.deliveries.map(row => [row.event.method, row.event.status]), [["save", "SUCCEEDED"], ["download", "FAILED"]]);
  await downloadRejected.c.issueWarrant();
  assert.strictEqual(downloadRejected.log.saves.length, 1);
  const unattached = harness("I-205");
  unattached.c.COPDoc.documents.attachMedia = async () => { throw new Error("attachment ledger quota"); };
  await unattached.c.issueWarrant();
  assert.strictEqual(unattached.log.media.length, 1, "the generated PDF may already exist in Media before attachment fails");
  assert.strictEqual(unattached.log.saves.length, 0, "failure before issuance stays blocked");
  assert.strictEqual(unattached.log.downloads.length, 0);
  assert.match(unattached.log.status.at(-1).message, /attachment ledger quota/);
  assert.strictEqual(unattached.c.location.href, "");

  const integrated = harness("I-205", { realLedger: true });
  await integrated.c.issueWarrant();
  assert.strictEqual(integrated.log.downloads.length, 1, "warrant adapter runs through actual shared ledger");
  const receipt = integrated.c.COPDoc.documents.list()[0];
  assert.strictEqual(receipt.status, "GENERATED");
  assert.strictEqual(receipt.mediaId, "media1");
  assert.strictEqual(receipt.outputHash, require("crypto").createHash("sha256").update(Buffer.from([80, 68, 70])).digest("hex"));
  assert.strictEqual(integrated.log.saves[0].person.warrants[0].documentGenerationId, receipt.generationId);
  assert.deepStrictEqual(Array.from(receipt.deliveries, row => row.status), ["SUCCEEDED", "SUBMITTED"]);

  // The public PDF helper still supports legacy callers, while the new optional
  // third argument removes any chance of hashing one blank and filling another.
  let loaded, fetches = 0;
  const bytes = new Uint8Array([1, 2, 3]);
  const helper = { console, fetch: async () => { fetches++; return { ok: true, arrayBuffer: async () => bytes.buffer }; }, PDFLib: { PDFDocument: { load: async value => { loaded = value; return { getForm: () => ({ updateFieldAppearances() {} }), save: async () => new Uint8Array([4]) }; } } } };
  helper.window = helper; vm.createContext(helper);
  vm.runInContext(read("functions/pdf/fill-warrant.js"), helper);
  await helper.COPDoc.pdf.fillWarrantPdf("blank.pdf", {}, bytes);
  assert.strictEqual(loaded, bytes); assert.strictEqual(fetches, 0);
  await helper.COPDoc.pdf.fillWarrantPdf("blank.pdf", {});
  assert.strictEqual(fetches, 1);
  console.log("PASS Stage 7 warrant contexts, golden maps, exact template capture, generation/issuance failures and PDF helper compatibility");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
