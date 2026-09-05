"use strict";

// This renderer runs without loading a page, model, repository, or PDF CDN.
// Stage 7's complete CAP/medical field golden separately verifies output parity.
const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const source = fs.readFileSync(path.join(__dirname, "../functions/documents/bookin-pdf.js"), "utf8");
const context = vm.createContext({ atob, Uint8Array, console: { warn() {} } });
vm.runInContext(source, context);
const renderer = context.COPDoc.bookInPdf;
const templateHash = "073f8dcde4faa1897ca308ddecb960b9d96f5a5e932ea84111c93016a2fd90da";
const hash = bytes => crypto.createHash("sha256").update(Buffer.from(bytes)).digest("hex");
assert.strictEqual(hash(renderer.templateBytes()), templateHash, "the supplied two-page template remains byte-identical");
const first = renderer.templateBytes();
first.fill(0);
assert.strictEqual(hash(renderer.templateBytes()), templateHash, "callers cannot modify the next run's template");
assert.strictEqual(renderer.formatCash("1234.5"), "$1,234.50");
assert.strictEqual(renderer.formatAlienName("Ada", "Example", name => name.toUpperCase()), "EXAMPLE, Ada");
assert.strictEqual(renderer.buildFilename({lastName: "TEST / A", iceEvent: "E-1"}), "TEST_A_E-1_Book_in.pdf");
assert.throws(() => renderer.create(), /requires a PDF engine/);

function engine() {
  const text = {}, boxes = {};
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const page = { node: { Annots: () => null, addAnnot() {} }, drawRectangle() {}, drawLine() {} };
  const form = {
    getFields: () => [],
    createTextField: () => ({ enableMultiline() {}, addToPage() {} }),
    createCheckBox: () => ({ addToPage() {} }),
    getTextField: name => ({
      ref: { toString: () => name },
      acroField: { getWidgets: () => [{ getRectangle: () => ({x:0,y:0,width:200,height:30}), setRectangle() {} }] },
      isMultiline: () => false, enableMultiline() {}, disableMultiline() {}, setFontSize() {},
      setText: value => { text[name] = value; }
    }),
    getCheckBox: name => ({ check: () => { boxes[name] = true; }, uncheck: () => { boxes[name] = false; } }),
    updateFieldAppearances() {}
  };
  return { text, boxes, release, PDFLib: {
    StandardFonts: { Helvetica: "Helvetica" }, rgb: (r,g,b) => [r,g,b],
    PDFDocument: { load: async bytes => {
      assert.strictEqual(hash(bytes), templateHash);
      await gate;
      return {
        getForm: () => form, getPages: () => [page,page],
        embedFont: async () => ({ widthOfTextAtSize: (text,size) => text.length*size/2, heightAtSize: size => size }),
        save: async () => new TextEncoder().encode(JSON.stringify({text,boxes}))
      };
    } }
  } };
}

(async () => {
  const a = engine(), b = engine();
  const inputA = Object.freeze({firstName:"Ada",lastName:"ONE",aNumber:"000000001",q2Answer:"",communicationAnswer:""});
  const inputB = Object.freeze({firstName:"Ben",lastName:"TWO",aNumber:"000000002",q2Answer:"no",communicationAnswer:"yes"});
  const runA = renderer.render(Object.freeze({input:inputA}), {PDFLib:a.PDFLib});
  const runB = renderer.render(Object.freeze({input:inputB}), {PDFLib:b.PDFLib});
  b.release();
  const outputB = await runB;
  a.release();
  const outputA = await runA;
  assert.strictEqual(a.text.alien_name, "ONE, Ada");
  assert.strictEqual(b.text.alien_name, "TWO, Ben");
  assert.strictEqual(a.text.Medicine, "");
  assert.strictEqual(b.text.Medicine, "None");
  assert.strictEqual(a.boxes.communication_yes, false);
  assert.strictEqual(a.boxes.communication_no, false);
  assert.strictEqual(b.boxes.communication_yes, true);
  assert.strictEqual(outputA.filename, "ONE_Book_in.pdf");
  assert.strictEqual(outputB.filename, "TWO_Book_in.pdf");
  assert.strictEqual(outputA.mimeType, "application/pdf");
  assert.strictEqual(outputA.warnings.length, 0);
  assert.strictEqual(inputA.firstName, "Ada");
  assert.deepStrictEqual(Object.keys(context).sort(), ["COPDoc","Uint8Array","atob","console"]);
  console.log("STAGE8_BOOKIN_MODULE_PASSED unchanged template, page-independent renderer, isolated concurrent engines and unknown medical answers.");
})().catch(error => { console.error(error); process.exitCode=1; });
