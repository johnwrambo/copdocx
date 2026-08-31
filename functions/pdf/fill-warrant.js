/**
 * Fill I-200 / I-205 blanks with pdf-lib. Never flatten.
 * Signature widgets stay empty for Adobe digital sign.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var pdf = (root.pdf = root.pdf || {});

  var PDF_LIB_SOURCES = [
    "https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js",
    "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js"
  ];

  function loadExternalScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = function () {
        reject(new Error("Could not load " + src));
      };
      document.head.appendChild(script);
    });
  }

  function ensurePdfLib() {
    if (global.PDFLib) {
      return Promise.resolve(global.PDFLib);
    }
    var chain = Promise.reject(new Error("start"));
    PDF_LIB_SOURCES.forEach(function (src) {
      chain = chain.catch(function () {
        return loadExternalScript(src).then(function () {
          if (!global.PDFLib) {
            throw new Error("pdf-lib did not attach after " + src);
          }
          return global.PDFLib;
        });
      });
    });
    return chain.catch(function () {
      throw new Error(
        "The PDF engine could not load. Stay online and try again."
      );
    });
  }

  function setTextField(form, name, value) {
    try {
      form.getTextField(name).setText(value == null ? "" : String(value));
    } catch (error) {
      console.warn("Could not fill text field", name, error);
    }
  }

  function setCheckBox(form, name, on) {
    try {
      var box = form.getCheckBox(name);
      if (on) {
        box.check();
      } else {
        box.uncheck();
      }
    } catch (error) {
      console.warn("Could not fill checkbox", name, error);
    }
  }

  function fillForm(form, mapped) {
    mapped = mapped || {};
    var texts = mapped.text || {};
    var checks = mapped.checkboxes || {};
    Object.keys(texts).forEach(function (name) {
      setTextField(form, name, texts[name]);
    });
    Object.keys(checks).forEach(function (name) {
      setCheckBox(form, name, !!checks[name]);
    });
  }

  function fillWarrantPdf(templateUrl, mapped) {
    return ensurePdfLib().then(function (PDFLib) {
      return fetch(templateUrl).then(function (res) {
        if (!res.ok) {
          throw new Error("Could not load " + templateUrl);
        }
        return res.arrayBuffer();
      }).then(function (bytes) {
        return PDFLib.PDFDocument.load(bytes);
      }).then(function (doc) {
        var form = doc.getForm();
        fillForm(form, mapped);
        try {
          form.updateFieldAppearances();
        } catch (error) {
          console.warn("Could not update field appearances", error);
        }
        return doc.save();
      });
    });
  }

  function downloadBytes(filename, bytes) {
    var blob = new Blob([bytes], { type: "application/pdf" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function sanitizeNamePart(value) {
    var text = String(value || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    return text || "UNKNOWN";
  }

  function compactANumber(value) {
    var digits = String(value || "").replace(/\D/g, "").slice(0, 9);
    if (!digits) {
      return "AUNKNOWN";
    }
    while (digits.length < 9) {
      digits = "0" + digits;
    }
    return "A" + digits;
  }

  function yyyymmddFromSlash(date) {
    var match = String(date || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
      var mm = match[1].length === 1 ? "0" + match[1] : match[1];
      var dd = match[2].length === 1 ? "0" + match[2] : match[2];
      return match[3] + mm + dd;
    }
    var iso = String(date || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
      return iso[1] + iso[2] + iso[3];
    }
    var now = new Date();
    var month = now.getMonth() + 1;
    var day = now.getDate();
    return (
      String(now.getFullYear()) +
      (month < 10 ? "0" + month : String(month)) +
      (day < 10 ? "0" + day : String(day))
    );
  }

  function warrantFileName(opts) {
    opts = opts || {};
    var formType = opts.formType === "I-205" ? "I-205" : "I-200";
    var person = opts.person || {};
    var name = person.name || person;
    var last = sanitizeNamePart(name.lastName);
    var first = sanitizeNamePart(name.firstName);
    var fileNo = compactANumber(
      opts.fileNo ||
        (person.immigration && person.immigration.alienNumber) ||
        ""
    );
    var day = yyyymmddFromSlash(opts.date);
    var base = formType + "_" + last + "_" + first + "_" + fileNo + "_" + day + ".pdf";
    var taken = opts.existingNames || [];
    if (taken.indexOf(base) !== -1 && opts.warrantId) {
      return (
        formType +
        "_" +
        last +
        "_" +
        first +
        "_" +
        fileNo +
        "_" +
        day +
        "_" +
        opts.warrantId +
        ".pdf"
      );
    }
    return base;
  }

  pdf.ensurePdfLib = ensurePdfLib;
  pdf.fillForm = fillForm;
  pdf.fillWarrantPdf = fillWarrantPdf;
  pdf.downloadBytes = downloadBytes;
  pdf.sanitizeNamePart = sanitizeNamePart;
  pdf.compactANumber = compactANumber;
  pdf.warrantFileName = warrantFileName;
})(typeof window !== "undefined" ? window : globalThis);
