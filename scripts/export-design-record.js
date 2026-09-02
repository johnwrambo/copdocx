"use strict";

var fs = require("fs");
var path = require("path");
var docx = require("docx");

var Document = docx.Document;
var Packer = docx.Packer;
var Paragraph = docx.Paragraph;
var TextRun = docx.TextRun;
var Header = docx.Header;
var Footer = docx.Footer;
var AlignmentType = docx.AlignmentType;
var HeadingLevel = docx.HeadingLevel;
var LevelFormat = docx.LevelFormat;
var BorderStyle = docx.BorderStyle;
var WidthType = docx.WidthType;
var ShadingType = docx.ShadingType;
var PageNumber = docx.PageNumber;
var TableOfContents = docx.TableOfContents;

function p(text, opts) {
  opts = opts || {};
  return new Paragraph({
    spacing: { after: 160 },
    children: [
      new TextRun({
        text: text,
        italics: !!opts.italics,
        bold: !!opts.bold,
        size: opts.size || 22,
        font: "Arial"
      })
    ]
  });
}

function h(level, text) {
  var map = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3
  };
  return new Paragraph({
    heading: map[level] || HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 140 },
    children: [new TextRun({ text: text, font: "Arial", bold: true })]
  });
}

function bullet(text, ref) {
  return new Paragraph({
    numbering: { reference: ref || "bullets", level: 0 },
    spacing: { after: 80 },
    children: [new TextRun({ text: text, font: "Arial", size: 22 })]
  });
}

function quote(text) {
  return new Paragraph({
    spacing: { after: 160, before: 80 },
    indent: { left: 360 },
    border: {
      left: { style: BorderStyle.SINGLE, size: 12, color: "1F4E79", space: 8 }
    },
    children: [new TextRun({ text: text, font: "Arial", size: 22, italics: true })]
  });
}

var skipExact = {
  go: true,
  "go.": true,
  please: true,
  ok: true,
  "ok.": true,
  resume: true,
  "push to git": true,
  "push to git first and then start": true,
  "push to git first and then start.": true
};

function shouldSkip(body) {
  var t = String(body || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!t) {
    return true;
  }
  if (skipExact[t]) {
    return true;
  }
  if (/^push to git/.test(t) && t.length < 80) {
    return true;
  }
  if (/^commit to git/.test(t) && t.length < 80) {
    return true;
  }
  if (t === "go back to plan mode") {
    return true;
  }
  if (t.indexOf("give me a compilation of all of the messages") === 0) {
    return true;
  }
  if (t === "next step go" || t === "next go" || t === "next step") {
    return true;
  }
  if (t === "propose a plan first") {
    return true;
  }
  return false;
}

function parseUserMessages(raw) {
  var chunks = String(raw || "").split(/\n## \d+\n/);
  var out = [];
  chunks.slice(1).forEach(function (chunk) {
    var body = chunk.replace(/\r\n/g, "\n").trim();
    if (shouldSkip(body)) {
      return;
    }
    out.push(body);
  });
  return out;
}

var extraMessages = [
  "An investigation is a graph of objects. A case is one person file. Every object uses the same factory/card. Stores stay split. Do not merge book-in. Do not rewrite PDF. Do not edit immigration.js.",
  "Add the ability to deselect from the place-type chips (Vehicle / Person / Location / \u2026). Click the selected type again to stop placing.",
  "We need to be able to delete objects. Also objects should have the same card format for fields, which includes pictures and locations. When a picture is attached to an object, that picture becomes the card on the wall, with the label.",
  "Do an audit on the integrity of the data structure and ensure everything is still intact and additions have been built correctly without duplicating objects.",
  "We need a clear all button for the workspace.",
  "We have the object list combined with the object card, this is bad UI. The card should probably be a popup window and opens when you click edit the object. The object list/directory could be a window you can open and close. I am now thinking of a windows drawer like in any graphic design program where you can toggle view/hide various control windows.",
  "We need a remove from wall, and delete record, or junk/archive.",
  "For each object, there is a field for associated persons. You can type a name and then hit Enter and then the field captures that name as the constructor for that person object, spawns the object and then draws the connection too. The card shows the person and then a relationship field, such as resident, owner, customer, etc. We will need to ensure the data model and data objects are updated to support this relational architecture. Ensure to include a fully robust relational object data model. Propose a plan for this.",
  "Export again, this time include in one doc all of the plans I have approved and then all of the major design instructions/messages I have given you. Ignore the small messages like go / push to git. Then go ahead with the next step (associated vehicles and places on the same Card constructor)."
];

var prior = parseUserMessages(
  fs.readFileSync(path.join(__dirname, "..", "docs", "user-messages.md"), "utf8")
);

var children = [];

children.push(
  new Paragraph({
    spacing: { after: 120 },
    children: [
      new TextRun({
        text: "COPDoc",
        bold: true,
        font: "Arial",
        size: 48,
        color: "1F4E79"
      })
    ]
  })
);
children.push(
  new Paragraph({
    spacing: { after: 80 },
    children: [
      new TextRun({
        text: "Approved plans and major design instructions",
        font: "Arial",
        size: 32
      })
    ]
  })
);
children.push(
  p(
    "Compiled 2 September 2026. This is an operator record of decisions you approved and the major instructions you gave. Small process messages (go, push to git, resume, next step go) are omitted. Living rules still live in docs/app-structure/; if this file and those files disagree, the app-structure folder wins for current behavior."
  )
);
children.push(new Paragraph({ children: [new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-2" })] }));

children.push(h(1, "Standing rules (do not move)"));
[
  "Vanilla HTML, JavaScript, and CSS. Pages live at the repo root.",
  "Stamp is 0.x until save-shape freeze.",
  "Stores stay split. Do not merge alien-book-in.saved-records.v1 into copdocx.store.v1.",
  "Do not rewrite book-in PDF layout. Do not edit data/immigration.js for structure work.",
  "An investigation is a graph of objects. A case is one person file.",
  "Every object uses the same factory and the same identity card.",
  "Open as case is identity-only: same personId, no RAP, no wall dump.",
  "Comment on D# / PR# / Q# in the living plan before coding a new direction."
].forEach(function (line) {
  children.push(bullet(line));
});

children.push(h(1, "Part I \u2014 Approved plans"));

children.push(h(2, "App structure"));
children.push(
  p(
    "List \u2192 view \u2192 form. Working rows are drafts; filed rows are committed. Chrome has one action slot (Add / Edit / Save occupy the same place). File is import/export only, not New/Open on record forms. Edit and Save occupy the same slot. Back goes to origin, not history.back(). Officers are not persons. Case vehicles are not fleet vehicles (governmentVehicle: false)."
  )
);

children.push(h(2, "Investigation wall"));
children.push(
  p(
    "The wall is where thinking happens before anyone is a Case. Typical plate-check: paste plates, discard junk, mark hits, promote a hit to a vehicle, title print to a person, residence as a location, spawn a child web with the same object ids (Venn overlap, not a clone)."
  )
);
[
  "D1 Wall is the workspace. Empty wall is valid. No stacked case-form inspector.",
  "D11 Same object, same identity card. Photo on the object is the wall chip face plus label.",
  "D2 Nodes are compact title chips. Identity fields live in the Card window.",
  "D3 Layout (x, y) is per investigation, not on the person/vehicle.",
  "D4 Graph of HTML nodes and SVG edges. Edge label is the A6 reason. No auto-layout.",
  "D5 Empty drag pans. Empty click places if a type is selected. Click chip focuses. Edit / double-click opens Card. Click selected type chip again to stop placing.",
  "D6 Promote sends a plate to the wall as a vehicle. Does not open a form stack.",
  "D7 Spawn is a new map from this thought. Same object ids, new node ids.",
  "D8 Reuse is typing, not a second search UI. Do not mint a second Garcia, Luis.",
  "D9 Focus-plex: selected plus one-hop bright; rest dim. Find dims non-matches; nothing is removed.",
  "D10 Do not put occupancy/nested blocks back on investigation vehicles.",
  "D12 Windows drawer (shipped 0.52.0): Plates, Objects, and Card are independent overlays you toggle."
].forEach(function (line) {
  children.push(bullet(line));
});

children.push(h(2, "Windows drawer (0.52.0)"));
children.push(
  p(
    "Borrow Illustrator / Photoshop / Figma Window palettes, not their data model. The wall is the canvas. Plates / Objects / Card overlay it. Click focuses. Edit or double-click opens Card. Placing a new object opens Card. Session UI in sessionStorage copdocx.investigation-windows.v1. Not draggable in the first ship. Objects default closed. Plates default open on plate-check."
  )
);

children.push(h(2, "Relational associations (0.53.0\u20130.55.0)"));
children.push(
  p(
    "Two kinds of thing: an Entity (person, vehicle, location, business, entity) holds only identity; an Association is the join (two ends, one A6 reason, optional occupancy dates, provenance). store.associations{} is the world fact. Investigation links[] cite associationId. Spawn copies the same association ids. Remove from wall drops the citation, not the fact."
  )
);
children.push(
  p(
    "Card constructor (approved): type a name (or plate, or street), Enter. That string is the constructor. Reuse if it exists, else mint. Spawn the object on this wall and draw the typed connection. The row shows the object and a relationship field (resident, owner, customer, \u2026). Host card stays open. \u00d7 drops this wall\u2019s citation. Off-wall rows get Place on wall. Title-print registeredOwnerName stays a string. Nested person.locations[] is not the source of truth (dual-write later)."
  )
);
[
  "D13 Associations are first-class.",
  "D14 One factory, one A6 catalog.",
  "D15 Wall layout is not the world fact.",
  "D16 Enter on the wall always resolves an object (no label-only ghosts).",
  "D17 Title print is not a person.",
  "D18 First composer was people (0.54.0); 0.55.0 is every type.",
  "D19 Open as case stays identity-only."
].forEach(function (line) {
  children.push(bullet(line));
});

children.push(h(1, "Part II \u2014 Major design instructions"));
children.push(
  p(
    "These are your words, lightly cleaned for line breaks. Process-only messages are omitted. Image attachments appear as [Image #n] where they did in chat."
  )
);

prior.concat(extraMessages).forEach(function (msg, i) {
  children.push(h(3, "Instruction " + (i + 1)));
  msg.split(/\n+/).forEach(function (line) {
    var t = line.trim();
    if (t) {
      children.push(quote(t));
    }
  });
});

children.push(h(1, "What is still later"));
[
  "Dual-write nested case person.locations[] / lead.vehicles[] from associations{}, then the case Associations tile reads associations{}.",
  "Draggable window palettes (Q8).",
  "Tab type-ahead: Tab still places a blank linked chip; the Card composer is the reuse path.",
  "Media blobs in JSON transfer.",
  "Do not merge book-in. Do not rewrite PDF."
].forEach(function (line) {
  children.push(bullet(line, "later"));
});

var doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: "1F4E79" },
        paragraph: { spacing: { before: 360, after: 160 }, outlineLevel: 0 }
      },
      {
        id: "Heading2",
        name: "Heading 2",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 26, bold: true, font: "Arial", color: "1F4E79" },
        paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1 }
      },
      {
        id: "Heading3",
        name: "Heading 3",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 24, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 }
      }
    ]
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: "\u2022",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } }
          }
        ]
      },
      {
        reference: "later",
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: "\u2022",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } }
          }
        ]
      }
    ]
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
        }
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              border: {
                bottom: { style: BorderStyle.SINGLE, size: 6, color: "1F4E79", space: 4 }
              },
              children: [
                new TextRun({
                  text: "COPDoc  \u2014  approved plans and design instructions",
                  font: "Arial",
                  size: 18,
                  color: "666666"
                })
              ]
            })
          ]
        })
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({ text: "Page ", font: "Arial", size: 18, color: "666666" }),
                new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 18, color: "666666" })
              ]
            })
          ]
        })
      },
      children: children
    }
  ]
});

var out = path.join(__dirname, "..", "docs", "COPDoc-approved-plans-and-instructions.docx");
Packer.toBuffer(doc).then(function (buffer) {
  fs.writeFileSync(out, buffer);
  console.log("wrote", out, "instructions", prior.length + extraMessages.length);
});
