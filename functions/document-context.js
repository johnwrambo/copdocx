/**
 * Stage 7 document input boundary. Capture does not read the DOM or any store.
 * Callers choose canonical records, historical snapshots, or draft form values
 * explicitly. A frozen context protects one generation from later UI edits.
 *
 * @typedef {{type:string,id:string,revision:(string|number|null),authority:
 *   ('canonical'|'draft'|'snapshot')}} DocumentSource
 * @typedef {{schemaVersion:number,documentType:string,capturedAt:string,
 *   generatingOfficerId:(string|null),entities:Object,sources:DocumentSource[],
 *   input:Object}} DocumentContext
 * The entities envelope has person, encounter, encounterSubject, booking,
 * arrest, officers[], vehicles[], and locations[]. It preserves the current
 * domain shapes; it does not normalize or migrate those stored records.
 */
(function (global) {
  "use strict";
  var app = global.COPDoc = global.COPDoc || {};
  var api = app.documents = app.documents || {};
  var own = function (o, key) { return Object.prototype.hasOwnProperty.call(o, key); };
  function record(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    var proto = Object.getPrototypeOf(value);
    return proto === null || Object.prototype.toString.call(value) === "[object Object]";
  }
  function copy(value, path, ancestors) {
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number" && isFinite(value)) return value;
    if (!Array.isArray(value) && !record(value)) throw new Error("Document context requires JSON data at " + path + ".");
    if (ancestors.indexOf(value) >= 0) throw new Error("Document context contains a cycle at " + path + ".");
    var next = ancestors.concat([value]);
    if (Array.isArray(value)) {
      var list = [];
      for (var index = 0; index < value.length; index += 1) {
        if (!own(value,index)) throw new Error("Document context requires a dense array at " + path + ".");
        list.push(copy(value[index],path + "[" + index + "]",next));
      }
      return Object.freeze(list);
    }
    var result = {};
    Object.keys(value).forEach(function (key) {
      if (value[key] === undefined) return;
      // defineProperty preserves data keys without invoking prototype setters.
      Object.defineProperty(result, key, {value:copy(value[key],path + "." + key,next),enumerable:true,writable:false,configurable:false});
    });
    return Object.freeze(result);
  }
  function identifier(value, field, optional) {
    if (optional && (value === undefined || value === null || value === "")) return null;
    if (typeof value !== "string" || !value.trim() || value !== value.trim()) throw new Error("Document " + field + " must be a nonempty identifier.");
    return value;
  }
  function source(raw) {
    if (!record(raw)) throw new Error("Document source must be an object.");
    var authority = raw.authority;
    if (["canonical","draft","snapshot"].indexOf(authority) < 0) throw new Error("Document source must declare its authority.");
    var revision = raw.revision === undefined ? null : raw.revision;
    if (revision !== null && typeof revision !== "string" && !(typeof revision === "number" && isFinite(revision))) throw new Error("Document source revision must be a string, number, or null.");
    return Object.freeze({type:identifier(raw.type,"source type"),id:identifier(raw.id,"source ID"),revision:revision,authority:authority});
  }
  function agree(left, right, description) {
    if (left !== undefined && left !== null && left !== "" && right !== undefined && right !== null && right !== "" && left !== right) {
      throw new Error("Document context has conflicting " + description + ".");
    }
  }
  function validateJoins(entities) {
    var p = entities.person || {}, e = entities.encounter || {}, s = entities.encounterSubject || {}, b = entities.booking || {}, a = entities.arrest || {};
    agree(p.personId,s.personId,"Person/subject IDs");
    agree(e.encounterId,s.encounterId,"Encounter/subject IDs");
    [b,a].forEach(function (row) {
      agree(p.personId,row.personId,"Person IDs");
      agree(e.encounterId,row.encounterId,"Encounter IDs");
      agree(s.subjectId,row.subjectId,"subject IDs");
    });
    agree(b.id,b.bookingId,"Booking aliases");
    agree(b.id,b.bookinRecordId,"Booking aliases");
    agree(b.bookingId,b.bookinRecordId,"Booking aliases");
    agree(s.bookingId,s.bookinRecordId,"subject Booking aliases");
    agree(a.bookingId,a.bookinRecordId,"Arrest Booking aliases");
    var bookingId = b.id || b.bookingId || b.bookinRecordId;
    agree(bookingId,s.bookingId || s.bookinRecordId,"subject Booking IDs");
    agree(bookingId,a.bookingId || a.bookinRecordId,"Arrest Booking IDs");
  }
  function captureContext(options) {
    if (!record(options)) throw new Error("Document context options must be an object.");
    var type = identifier(options.documentType,"type");
    if (api.registry && !api.registry.get(type)) throw new Error("Unknown document type: " + type + ".");
    if (!record(options.input)) throw new Error("Document renderer input must be an object.");
    var entities = {};
    ["person","encounter","encounterSubject","booking","arrest"].forEach(function (key) {
      var value = options[key];
      if (value !== undefined && value !== null && !record(value)) throw new Error("Document " + key + " must be an object or null.");
      entities[key] = value === undefined ? null : value;
    });
    ["officers","vehicles","locations"].forEach(function (key) {
      var value = options[key] === undefined ? [] : options[key];
      if (!Array.isArray(value) || value.some(function (row) { return !record(row); })) throw new Error("Document " + key + " must be an array of objects.");
      entities[key] = value;
    });
    validateJoins(entities);
    var rows = options.sources === undefined ? [] : options.sources;
    if (!Array.isArray(rows)) throw new Error("Document sources must be an array.");
    var sources = rows.map(source), seen = Object.create(null);
    sources.forEach(function (row) {
      var key = JSON.stringify([row.type,row.id,row.authority]);
      if (own(seen,key) && seen[key] !== row.revision) throw new Error("Document source has conflicting revisions.");
      seen[key] = row.revision;
    });
    var capturedAt = options.capturedAt === undefined ? new Date().toISOString() : options.capturedAt;
    if (typeof capturedAt !== "string" || !isFinite(Date.parse(capturedAt))) throw new Error("Document capture time must be a valid date string.");
    return copy({schemaVersion:1,documentType:type,capturedAt:capturedAt,generatingOfficerId:identifier(options.generatingOfficerId,"generating officer ID",true),entities:entities,sources:sources,input:options.input},"context",[]);
  }
  api.captureContext = captureContext;
  // Stable JSON is shared by tests and hashing. Array order remains meaningful.
  api.stableStringify = function stableStringify(value) {
    var normalized = copy(value,"value",[]);
    function encode(item) {
      if (Array.isArray(item)) return "[" + item.map(encode).join(",") + "]";
      if (item && typeof item === "object") return "{" + Object.keys(item).sort().map(function (key) { return JSON.stringify(key) + ":" + encode(item[key]); }).join(",") + "}";
      return JSON.stringify(item);
    }
    return encode(normalized);
  };
})(typeof window !== "undefined" ? window : globalThis);
