const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const leadHtml = fs.readFileSync(path.join(root, "lead-form.html"), "utf8");
const caseHtml = fs.readFileSync(path.join(root, "case.html"), "utf8");
const caseEdit = fs.readFileSync(
  path.join(root, "functions", "case-edit.js"),
  "utf8"
);

function check(name, condition) {
  if (!condition) {
    throw new Error("not ok " + name);
  }
  console.log("ok " + name);
}

function template(html, id) {
  const match = html.match(
    new RegExp('<template\\s+id="' + id + '"[\\s\\S]*?<\\/template>')
  );
  return match ? match[0] : "";
}

function fields(html, id) {
  const values = [];
  const block = template(html, id);
  const pattern = /data-field="([^"]+)"/g;
  let match;
  while ((match = pattern.exec(block))) {
    if (!values.includes(match[1])) {
      values.push(match[1]);
    }
  }
  return values.sort();
}

check(
  "case Vehicle card matches Lead-form fields",
  JSON.stringify(fields(caseHtml, "vehicleCardTemplate")) ===
    JSON.stringify(fields(leadHtml, "vehicleCardTemplate"))
);
check(
  "case Location card matches Lead-form fields",
  JSON.stringify(fields(caseHtml, "locationCardTemplate")) ===
    JSON.stringify(fields(leadHtml, "locationCardTemplate"))
);
check(
  "case Association editor exposes every canonical object type",
  ["PERSON", "VEHICLE", "LOCATION", "BUSINESS", "ENTITY"].every((type) =>
    template(caseHtml, "relationshipCardTemplate").includes(
      'value="' + type + '"'
    )
  )
);
check(
  "case editor has Cancel Apply and Save Close",
  caseHtml.includes('id="caseEditCancel"') &&
    caseHtml.includes('id="caseEditApply"') &&
    caseHtml.includes('id="caseEditSave"') &&
    caseHtml.includes("Save &amp; Close")
);
check(
  "retired one-line Case composer is absent",
  !caseHtml.includes('id="caseAssociationsComposer"')
);
check(
  "new Case Vehicle and Location editors do not pre-save stubs",
  !caseEdit.includes("addStubThenOpen")
);
check(
  "new Association editor persists a full object through the gateway",
  caseEdit.includes("objectRecord: collected.record") &&
    caseEdit.includes("m.store.associateCaseObject")
);

console.log("all object workflow tests passed");
