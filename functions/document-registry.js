/** Stage 7 reviewed field lineage. This is an explicit contract, not reflection.
 * Root dependencies intentionally cover extensible template/override objects.
 * A match means review that output before renaming the field; conditional seed
 * dependencies do not rewrite existing saved narrative or card snapshots.
 */
(function (global) {
  "use strict";
  var app = global.COPDoc = global.COPDoc || {};
  var documents = app.documents = app.documents || {};
  var entries = [];
  function freeze(value) {
    if (value && typeof value === "object") { Object.keys(value).forEach(function (key) { freeze(value[key]); }); Object.freeze(value); }
    return value;
  }
  function fields(prefix, names, source, citation, notes) {
    return names.map(function (name) { return {field:prefix + name,source:source,authority:source.indexOf("snapshot") >= 0 ? "snapshot" : source.indexOf("input") >= 0 ? "draft" : "canonical",citation:citation,notes:notes || ""}; });
  }
  function item(type, title, sourceFiles, dependencies, options) {
    options = options || {};
    entries.push({documentType:type,title:title,template:{id:options.templateId || type,version:options.version || "stage7.1",sourceFiles:sourceFiles},dependencies:dependencies,output:options.output || "text/html",notes:options.notes || ""});
  }
  var bookinCitation = "functions/documents/bookin-pdf.js#fillCapPage/fillMedicalPdf";
  var bookin = fields("input.", ["firstName","lastName","aNumber","iceEvent","officersName","dateTime","dateOfBirth","age","gender","countryOfCitizenship","caseType","team","cash","travelDocs","propertyTag","cellNum","children","medicalIssues","medicine","communicationAnswer","q1Answer","q2Answer","additionalObservations","referralAnswer"], "input: captured Book-In form", bookinCitation);
  for (var q = 3; q <= 13; q += 1) bookin = bookin.concat(fields("input.",["q" + q + "Answer","q" + q + "Details"],"input: captured Book-In form",bookinCitation));
  bookin = bookin.concat(fields("person.",["name.firstName","name.lastName","dateOfBirth","sex","citizenship","immigration.alienNumber","immigration.disposition"],"input: Book-In form seed","functions/book-in.js#prefillFromLeadQuery","Prefill lineage only; the captured edited form is authoritative for this PDF."));
  item("bookin.combined-pdf","Book-In CAP and medical packet",["functions/book-in.js","functions/documents/bookin-pdf.js"],bookin,{output:"application/pdf",templateId:"book-in-embedded-cap-medical",version:"stage7.1",notes:"Embedded PDF bytes plus CAP/medical mappers. Unused form fields are not dependencies. Medical questions 5/6 are suppressed for Male at capture."});
  function warrantDependencies(type) {
    var names = type === "i200" ? ["fileNo","date","determination","officerName","officerTitle","location","nameOfAlien","dateOfService","language","interpreter","basis.charging","basis.pending","basis.deferred","basis.biometric","basis.voluntary"] : ["fileNo","date","fullName","entryPlace","entryDate","inaLaw","officerTitle","location","order.ij","order.official","order.bia","order.court"];
    return fields("input.values.",names,"input: captured warrant form","functions/warrant-issue.js#collectValues")
      .concat(fields("input.",["mapped.text","mapped.checkboxes"],"input: PDF fill map","functions/pdf/" + type + "-map.js#mapI" + type.slice(1)))
      .concat(fields("person.",["name.firstName","name.middleName","name.lastName","immigration.alienNumber"],"input: warrant form seed","functions/warrant-issue.js#currentLead/collectValues","Captured form edits win; existing issued PDF bytes do not change."))
      .concat(fields("officer.",["firstName","middleName","lastName","role"],"input: selected officer form seed","functions/warrant-issue.js#collectValues"));
  }
  ["i200","i205"].forEach(function (type) {
    item("warrant." + type,"Warrant " + type.toUpperCase(),["functions/warrant-issue.js","functions/pdf/fill-warrant.js","functions/pdf/" + type + "-map.js","assets/pdf/" + type.toUpperCase() + "_BLANK.pdf"],warrantDependencies(type),{templateId:"assets/pdf/" + type.toUpperCase() + "_BLANK.pdf",output:"application/pdf",notes:"Signature widgets remain blank. I-205 execution and fingerprint widgets remain blank."});
  });
  var arrest = fields("person.",["personId","name.firstName","name.lastName","age","citizenship","immigration.alienNumber","immigration.disposition","criminal.fbiNumber"],"canonical: Person registry","functions/arrest-report.js#collect")
    .concat(fields("arrest.",["arrestId","subjectId","bookinRecordId","bookingId","encounterId","encounterNumber","iceEventNumber","arrestDateTime","arrestDate","arrestTime","arrestingOfficer","team","updatedAt","voidedAt"],"canonical: Person.arrests","functions/arrest-report.js#collect"))
    .concat(fields("booking.",["id","bookingId","bookinRecordId","personId","leadId","subjectId","encounterId","encounterNumber","voidedAt","updatedAt","inputValues"],"canonical: Book-In fallback/provenance","functions/arrest-report.js#bookInForArrest/collect","Fallback only after all supplied join identifiers agree."))
    .concat(fields("encounter.subjects[].",["subjectId","personId","bookingId"],"canonical: Encounter subject join","functions/arrest-report.js#validEncounterLink"))
    .concat(fields("person.immigration.baseballCards[].",["cardId","subjectId","personId","encounterId","bookinRecordId","arrestOfDay","finalizedSnapshot","voidedAt"],"snapshot: selected finalized card","functions/arrest-report.js#finalizedCandidate/chooseDailyCards/cardHtml","Globally selected finalized card per arrest date; later draft card edits do not replace it."))
    .concat(fields("input.",["rows","options.mode","options.columns"],"input: selected report rows and presentation options","functions/arrest-roster.js#copyReport"));
  item("arrest-report.email","Daily arrest report email",["functions/arrest-report.js","functions/arrest-roster.js","functions/baseball-card-contract.js"],arrest,{version:"alien-book-in-1.12.0/stage7.1",notes:"Canonical nonvoid arrest population, exact Encounter joins, selected finalized card and Media photo. Report presentation preserves v1.12.0."});
  var card = fields("input.state.",["fields","gender","criminalHistory","content","layout","photoAdjustments","photoDataUrl","photoMediaId","renderedPhotoDataUrl"],"input: Baseball Card presentation snapshot","functions/baseball-card-contract.js#generateContent/renderEmail/plainText/renderPhoto")
    .concat(fields("input.state.fields.",["baseballLastName","baseballFirstName","baseballAge","baseballCountry","baseballAlienNumber","baseballArrestDate","baseballDisposition","baseballFinalOrderDate","baseballFirstDeportationDate","baseballLastDeportationDate"],"input: Baseball Card presentation fields","functions/baseball-card-contract.js#generateContent","Used when manual content has not overridden generated content."))
    .concat(fields("person.",["name","age","sex","citizenship","immigration.alienNumber","immigration.disposition","immigration.baseballCards","immigration.finalOrderDate","immigration.firstDeportationDate","immigration.lastDeportationDate","criminal","convictions","arrests"],"input: Baseball Card seed","functions/baseball-page.js#hydrateFromLead","Prefill lineage only. Presentation edits and saved/finalized snapshots retain their own authority."))
    .concat(fields("input.",["content","photoDataUrl","plainText","title","legacyHtml","download","placeholder"],"input: final card delivery","functions/baseball-page.js#generateCardDocument"));
  item("baseball-card.html","Baseball Card HTML and clipboard",["functions/baseball-card-contract.js","functions/baseball-page.js","functions/baseballcard.js"],card,{version:"alien-book-in-1.12.0/state2/stage7.1"});
  var narrative = fields("input.",["output","text","state","sourceSnapshot","filename","trailingNewline"],"snapshot: exact narrative output, overrides and source context","functions/narratives/narrative-page.js#outputForExport","Stored finalPlainText is authoritative for a saved/read-only narrative, including intentionally empty text. Template/state roots are extensible." )
    .concat(fields("narrative.output.",["finalPlainText","plainText","generatedResolvedText"],"snapshot: saved narrative text","functions/narratives/narrative-page.js#outputForExport/downloadOutputText"))
    .concat(fields("encounterSubject.",["subjectId","personId","encounterId","outcome","subjectRole","occupantRole"],"snapshot: narrative source at draft capture","functions/narratives/packet-builder.js#participantObject","Upstream draft-source dependency; historical output is not regenerated automatically."))
    .concat(fields("person.",["name","dateOfBirth","sex","citizenship","immigration.alienNumber","immigration.disposition"],"snapshot: narrative identity/immigration source","functions/narratives/packet-builder.js#participantObject","Upstream source is captured through identitySnapshot/immigrationSnapshot and template packet."))
    .concat(fields("narrative.sourceSnapshot.",["schema","encounterId","focusSubjectId","fingerprint"],"snapshot: narrative source comparison marker","functions/narratives/source-freshness.js#capture"));
  ["text","json"].forEach(function (format) {
    item("narrative." + format,"Narrative " + format.toUpperCase(),["functions/narratives/narrative-page.js","functions/narratives/narrative-builder-engine.js","functions/narratives/packet-builder.js","functions/narratives/source-freshness.js"],narrative,{version:"narrative-output-v3/stage7.1",output:format === "text" ? "text/plain" : "application/json",notes:"Saved output and explicit user overrides are preserved. A rename can affect future builds without altering existing narrative snapshots."});
  });
  var lead = fields("person.",["name.lastName","name.firstName","name.middleName","sex","dateOfBirth","age","citizenship","immigration.alienNumber"],"canonical: current Case subject","functions/leads.js#leadCsvRow")
    .concat(fields("lead.source.",["caseNumber","leadSource"],"canonical: Case","functions/leads.js#leadCsvRow"))
    .concat(fields("lead.vehicles[0].",["licensePlate","plateState"],"canonical: Case vehicle snapshot","functions/leads.js#leadCsvRow","Legacy aliases plate and state remain accepted."));
  lead[lead.length-2].legacyAliases = ["lead.vehicles[0].plate"];
  lead[lead.length-1].legacyAliases = ["lead.vehicles[0].state"];
  lead = lead.concat(fields("vehicle.",["licensePlate","plateState"],"canonical: vehicle registry when linked ID resolves","functions/leads.js#leadCsvRow","Current vehicle registry fields replace the legacy embedded Case snapshot when available."));
  lead[lead.length-2].legacyAliases = ["vehicle.plate"];
  lead[lead.length-1].legacyAliases = ["vehicle.state"];
  item("lead.csv","Filed Case CSV",["functions/leads.js"],lead,{output:"text/csv",notes:"Single Case and filed Case list share the same columns and CSV escaping contract."});
  var target = fields("person.",["personId","name","sex","dateOfBirth","age","citizenship","immigration","criminal","aliases","convictions","warrants","locations"],"canonical: current subject with presentation snapshot","functions/leads.js#paintTargetSheet/paintTargetWarrants")
    .concat(fields("lead.",["leadId","source","assignedOfficerId","locations","vehicles","notes","links","meta.updatedAt"],"canonical: Case","functions/leads.js#paintTargetSheet/collectSubjectPlaces"))
    .concat(fields("location.",["locationId","street","street2","city","state","zip","latitude","longitude","association","targetPriority","pinColor"],"snapshot: Person/Case embedded location projection","functions/leads.js#collectSubjectPlaces"))
    .concat(fields("vehicle.",["vehicleId","licensePlate","plate","plateState","vehicleMake","vehicleModel","vehicleYear","vehicleColor","registeredOwnerName","locations"],"snapshot: Case embedded vehicle projection","functions/leads.js#paintTargetSheet"))
    .concat(fields("officer.",["officerId","firstName","middleName","lastName"],"canonical: officer display","functions/leads.js#paintTargetSheet"))
    .concat(fields("media.",["mediaId","sha256","roles"],"snapshot: embedded target photos and warrant links","functions/leads.js#saveTargetSheetHtml"))
    .concat(fields("input.",["html","map"],"input: prepared self-contained target sheet","functions/leads.js#saveTargetSheetHtml","Map imagery and icon choices are presentation inputs."));
  item("target-sheet.html","Target sheet HTML",["functions/leads.js","mobile-target-sheet.html","style/style.css","vendor/leaflet/leaflet.css","vendor/leaflet/leaflet.js","assets/icons/copdoc-icons.js","functions/map-popup.js","functions/location-map.js"],target);
  var operation = fields("operation.",["operationId","operationNumber","name","plannedStart","plannedEnd","order.narrative","order.officerBriefs","targets[].targetId","targets[].leadId","targets[].personId","targets[].freeze.subjectLabel","targets[].freeze.places","teams[].teamId","teams[].name","teams[].members[].officerId","teams[].members[].assignmentRole","targetAssignments[].targetId","targetAssignments[].teamId"],"canonical: issued Operation with frozen targets","functions/operations.js#paintBrief")
    .concat(fields("lead.person.",["name","locations"],"snapshot: fallback Case subject when target freeze absent","functions/operations.js#targetLabel/placesForTarget"))
    .concat(fields("lead.",["vehicles"],"snapshot: fallback Case vehicles when target freeze absent","functions/model/operation.js#operationPlacesFromLead"))
    .concat(fields("officer.",["officerId","firstName","middleName","lastName"],"canonical: live officer display","functions/operations.js#paintBrief"))
    .concat(fields("media.",["mediaId","sha256","primary","owner"],"snapshot: target Person photo","functions/operations.js#fillTargetPhoto"))
    .concat(fields("input.",["html"],"input: prepared operation brief","functions/operations.js#saveOperationBrief/printBrief"));
  ["html","print"].forEach(function (format) { item("operation-brief." + format,"Operation brief " + format,["functions/operations.js","functions/model/operation.js","operation-brief.html","style/style.css"],operation,{notes:"Target labels/places are issued-operation snapshots; officer display and target photos are live at capture. Print tracks prepared content, not printer completion."}); });
  var mapBrief = fields("input.",["html","styles","map.center","map.zoom","map.basemap","map.width","map.height","map.layers","map.visualFilters","map.iconSize","markup.labels","markup.arrows","tiles[].url","rows"],"snapshot: detached displayed map and visible catalog","functions/map-markup.js#printBrief","Captures displayed HTML, markup, view settings and tile URLs. The document hash does not authenticate remote tile image bytes or printed pixels.")
    .concat(fields("lead.",["leadId","meta","person","locations","vehicles"],"snapshot: map Case projection","functions/map-targets.js#collectLeads/walkLeadLocations"))
    .concat(fields("person.",["personId","name","locations","immigration.disposition","immigration.finalOrder","immigration.finalOrderDate","criminal.isCriminal","criminal.hasCriminalRecord","criminal.hasCriminalWarrants"],"snapshot: displayed target identity and flags","functions/map-targets.js#subjectFor/personFlags"))
    .concat(fields("arrest.",["voidedAt","arrestLocation","latitude","longitude","encounterId"],"snapshot: canonical arrest or legacy Case fallback","functions/map-targets.js#collectLeads"))
    .concat(fields("encounter.",["encounterId","completed","subjects","eventType"],"snapshot: completed Encounter map view","functions/map-targets.js#collectEncounters/encounterFlags"))
    .concat(fields("location.",["locationId","street","street2","city","state","zip","latitude","longitude","association","locationAssociation","targetPriority"],"snapshot: displayed map location","functions/map-targets.js#collectLeads/formatAddress"))
    .concat(fields("officer.",["officerId","id","firstName","lastName","duty","locations","address","junked","meta"],"snapshot: displayed officer catalog","functions/map-targets.js#collectOfficers"));
  item("map-brief.print","Map brief print",["functions/map-markup.js","functions/map.js","functions/map-targets.js","functions/map-popup.js","assets/icons/copdoc-icons.js","style/style.css","vendor/leaflet/leaflet.css","vendor/leaflet/leaflet.js","map.html"],mapBrief,{notes:"Frozen map view and annotations submitted for printing. Remote imagery remains a referenced presentation dependency; print submission does not prove printer completion."});
  entries.forEach(function (entry) {
    entry.dependencies.forEach(function (dependency) {
      if (dependency.field === "officer.officerId") dependency.legacyAliases = ["officer.id"];
    });
  });
  var queryAliases = {"person.dob":"person.dateOfBirth"};
  function normalize(path) { return String(path || "").trim().replace(/\[(?:\d+|\*)?\]/g,"[]"); }
  function overlaps(left,right) {
    left = normalize(left); right = normalize(right);
    function prefix(a,b) { return a === b || b.indexOf(a + ".") === 0 || b.indexOf(a + "[]") === 0; }
    return prefix(left,right) || prefix(right,left);
  }
  function get(type) { return entries.filter(function (entry) { return entry.documentType === type; })[0] || null; }
  function dependentsOf(fieldPath) {
    var field = normalize(queryAliases[fieldPath] || fieldPath);
    if (!field) return [];
    return entries.filter(function (entry) {
      return entry.dependencies.some(function (dependency) { return [dependency.field].concat(dependency.legacyAliases || []).some(function (candidate) { return overlaps(candidate,field); }); });
    });
  }
  var manifest = freeze({schema:"copdocx.document-dependencies.v1",scope:"Explicit reviewed direct inputs and upstream seed/snapshot lineage for user-requested document delivery. Conditional roots are conservative rename-impact boundaries; this is not automatic code reflection.",queryAliases:queryAliases,documentTypes:entries});
  documents.registry = Object.freeze({get:get,all:function () { return entries.slice(); },dependentsOf:dependentsOf,manifest:function () { return manifest; }});
})(typeof window !== "undefined" ? window : globalThis);
