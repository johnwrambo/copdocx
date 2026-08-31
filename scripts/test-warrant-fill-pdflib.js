"use strict";

var fs = require("fs");
var http = require("http");
var https = require("https");
var os = require("os");
var path = require("path");
var vm = require("vm");

var ROOT = path.join(__dirname, "..");
var OUT = path.join(os.tmpdir(), "copdocx-warrant-fill");

function get(url) {
  return new Promise(function (resolve, reject) {
    var lib = url.indexOf("https") === 0 ? https : http;
    lib
      .get(url, function (res) {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          get(res.headers.location).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(url + " -> " + res.statusCode));
          return;
        }
        var chunks = [];
        res.on("data", function (c) {
          chunks.push(c);
        });
        res.on("end", function () {
          resolve(Buffer.concat(chunks).toString("utf8"));
        });
      })
      .on("error", reject);
  });
}

function loadVm(code, context) {
  vm.runInContext(code, context);
}

async function main() {
  var context = {
    window: {},
    console: console,
    Uint8Array: Uint8Array,
    ArrayBuffer: ArrayBuffer,
    Buffer: Buffer,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setImmediate: setImmediate,
    DataView: DataView,
    Uint16Array: Uint16Array,
    Int8Array: Int8Array,
    Promise: Promise
  };
  context.globalThis = context;
  context.window = context;
  vm.createContext(context);
  loadVm(fs.readFileSync(path.join(ROOT, "functions/pdf/i200-map.js"), "utf8"), context);
  loadVm(fs.readFileSync(path.join(ROOT, "functions/pdf/i205-map.js"), "utf8"), context);
  loadVm(fs.readFileSync(path.join(ROOT, "functions/pdf/fill-warrant.js"), "utf8"), context);

  var src = await get("https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js");
  loadVm(src, context);
  if (!context.PDFLib) {
    throw new Error("pdf-lib did not attach");
  }

  var pdf = context.COPDoc.pdf;
  fs.mkdirSync(OUT, { recursive: true });

  async function fillOne(formType, templateRel, mapped, outName) {
    var bytes = new Uint8Array(fs.readFileSync(path.join(ROOT, templateRel)));
    var doc = await context.PDFLib.PDFDocument.load(bytes);
    var form = doc.getForm();
    var before = form.getFields().length;
    pdf.fillForm(form, mapped);
    try {
      form.updateFieldAppearances();
    } catch (error) {
      console.warn("appearances", error.message);
    }
    if (typeof form.flatten === "function" && form.flatten.length && false) {
      form.flatten();
    }
    var out = await doc.save();
    var again = await context.PDFLib.PDFDocument.load(out);
    var after = again.getForm().getFields().length;
    var names = again.getForm().getFields().map(function (f) {
      return f.getName();
    });
    fs.writeFileSync(path.join(OUT, outName), Buffer.from(out));
    return { before: before, after: after, names: names, bytes: out.length };
  }

  var r200 = await fillOne(
    "I-200",
    "assets/pdf/I200_BLANK.pdf",
    pdf.mapI200({
      fileNo: "A000 111 222",
      date: "08/30/2026",
      officerName: "REYES, Maria",
      officerTitle: "IO",
      location: "ERO Dallas",
      nameOfAlien: "GARCIA, LUIS",
      basis: { charging: true }
    }),
    "I-200_GARCIA_LUIS_A000111222_20260830.pdf"
  );
  var r205 = await fillOne(
    "I-205",
    "assets/pdf/I205_BLANK.pdf",
    pdf.mapI205({
      fileNo: "A000 111 222",
      date: "08/30/2026",
      fullName: "GARCIA, LUIS",
      officerTitle: "IO",
      location: "ERO Dallas",
      inaLaw: "237(a)(1)(A)",
      order: { ij: true }
    }),
    "I-205_GARCIA_LUIS_A000111222_20260830.pdf"
  );

  var fail = 0;
  function check(label, ok, extra) {
    if (!ok) {
      fail += 1;
      console.log("FAIL", label, extra || "");
    } else {
      console.log("ok", label);
    }
  }
  check("I-200 field count stays 16", r200.before === 16 && r200.after === 16, r200);
  check("I-205 field count stays 26", r205.before === 26 && r205.after === 26, r205);
  check(
    "I-200 signatures remain",
    r200.names.indexOf("Signature of Authorized Immigration Officer") !== -1 &&
      r200.names.indexOf("Name and Signature of Officer") !== -1
  );
  check(
    "I-205 signatures remain",
    r205.names.indexOf("Signature of immigration officer") !== -1
  );
  if (fail) {
    process.exit(1);
  }
  console.log("ok pdf-lib unflattened fill");
}

main().catch(function (error) {
  console.error(error);
  process.exit(1);
});
