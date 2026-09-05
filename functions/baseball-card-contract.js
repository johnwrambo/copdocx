/* Shared, DOM-independent Baseball Card state and output contract.
 * The v2 presentation shape follows Alien Book-In v1.12.0 (export schema 5).
 * Presentation edits never update a Person's identity. Persistence belongs to callers.
 */
(function (root) {
  "use strict";
  var app = root.COPDoc = root.COPDoc || {};
  var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o || {}, k); };
  var plain = function (o) { return !!o && typeof o === "object" && !Array.isArray(o); };
  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (!plain(value)) return value;
    var result = {};
    Object.keys(value).forEach(function (key) {
      if (key !== "__proto__" && key !== "constructor" && key !== "prototype") result[key] = clone(value[key]);
    });
    return result;
  }
  function text(v) { return v === undefined || v === null ? "" : String(v); }
  function bounded(v, min, max, fallback, precision) {
    var n = v === undefined || v === null || v === "" ? fallback : Number(v);
    if (!isFinite(n)) n = fallback;
    var factor = Math.pow(10, precision || 0);
    return Math.round(Math.min(max, Math.max(min, n)) * factor) / factor;
  }
  var defaultLayout = Object.freeze({ cardWidthPx:1050, photoWidthPercent:34, photoHeightPx:570, lineWidthPx:1, lineColor:"#8a8a8a", lineStyle:"solid", headerHeightPx:44, headerFontSizePx:20, contentFontSizePx:16, contentPaddingPx:20 });
  var defaultPhotoAdjustments = Object.freeze({ zoom:1, positionX:50, positionY:0, rotation:0, flipX:false, brightness:100, contrast:100 });
  var layoutPresets = Object.freeze({
    compact:Object.freeze({cardWidthPx:800,photoWidthPercent:32,photoHeightPx:470,lineWidthPx:1,lineColor:"#8a8a8a",lineStyle:"solid",headerHeightPx:40,headerFontSizePx:18,contentFontSizePx:14,contentPaddingPx:16}),
    wide:Object.freeze({cardWidthPx:1300,photoWidthPercent:38,photoHeightPx:650,lineWidthPx:1.5,lineColor:"#64748b",lineStyle:"solid",headerHeightPx:52,headerFontSizePx:22,contentFontSizePx:17,contentPaddingPx:24})
  });
  var fieldIds = Object.freeze(["baseballLastName","baseballFirstName","baseballAge","baseballCountry","baseballAlienNumber","baseballArrestDate","baseballDisposition","baseballFinalOrderDate","baseballFirstDeportationDate","baseballLastDeportationDate"]);
  var fonts = ["Arial, Helvetica, sans-serif", "Calibri, Carlito, sans-serif", '"Times New Roman", Times, serif', "Georgia, serif", '"Segoe UI", Tahoma, sans-serif'];
  function normalizeLayout(raw) {
    var s = plain(raw) ? clone(raw) : {};
    var aliases = {cardWidthPx:"cardWidth",photoWidthPercent:"photoPercent",photoHeightPx:"photoMinHeight",lineWidthPx:"lineWidth",headerFontSizePx:"headingSize",contentFontSizePx:"bodySize"};
    Object.keys(aliases).forEach(function (key) { if (!own(s,key) && own(s,aliases[key])) s[key] = s[aliases[key]]; });
    var ranges = {cardWidthPx:[480,1600],photoWidthPercent:[20,60],photoHeightPx:[240,1000],lineWidthPx:[0,8,2],headerHeightPx:[30,120],headerFontSizePx:[12,36],contentFontSizePx:[10,28],contentPaddingPx:[0,48]};
    Object.keys(ranges).forEach(function (key) { var r=ranges[key]; s[key]=bounded(s[key],r[0],r[1],defaultLayout[key],r[2]); });
    s.lineColor = /^#[0-9a-f]{6}$/i.test(text(s.lineColor)) ? s.lineColor.toLowerCase() : defaultLayout.lineColor;
    s.lineStyle = ["solid","dashed","double"].indexOf(s.lineStyle) >= 0 ? s.lineStyle : defaultLayout.lineStyle;
    if (own(s,"fontFamily")) s.fontFamily = fonts.indexOf(s.fontFamily)>=0 ? s.fontFamily : fonts[0];
    if (own(s,"lineHeight")) s.lineHeight = bounded(s.lineHeight,1.2,1.8,1.45,2);
    return s;
  }
  function normalizePhotoAdjustments(raw) {
    var s = plain(raw) ? clone(raw) : {};
    var ranges={zoom:[1,3,2],positionX:[0,100],positionY:[0,100],rotation:[-180,180],brightness:[50,150],contrast:[50,150]};
    Object.keys(ranges).forEach(function (key) {var r=ranges[key];s[key]=bounded(s[key],r[0],r[1],defaultPhotoAdjustments[key],r[2]);});
    s.flipX=s.flipX===true;
    return s;
  }
  function normalizeHistory(rows) {
    if (rows === undefined || rows === null) return [];
    if (!Array.isArray(rows)) throw new Error("Baseball Card criminal history must be an array.");
    return rows.map(function (row) {
      if (!plain(row)) throw new Error("Baseball Card criminal history contains an invalid row.");
      var s=clone(row);
      ["charge","convictionDate","state","court"].forEach(function (k) {s[k]=text(s[k]);});
      s.jurisdiction=own(s,"jurisdiction")?text(s.jurisdiction):text(s.city||s.county);
      s.jurisdictionType=["City","County"].indexOf(s.jurisdictionType)>=0?s.jurisdictionType:(s.city&&!s.county?"City":"County");
      return s;
    });
  }
  function normalizeContent(raw) {
    if (raw===undefined || raw===null) return null;
    if (!plain(raw) || (own(raw,"bullets")&&!Array.isArray(raw.bullets))) throw new Error("Baseball Card content is invalid.");
    var s=clone(raw);s.narrative=text(s.narrative);s.heading=text(s.heading);s.bullets=(s.bullets||[]).map(text);return s;
  }
  function safePhoto(source) {
    var value=text(source);
    return /^(data:image\/(?:png|jpe?g|webp|gif|bmp);base64,[a-z0-9+/=\s]+|blob:[^\s<>"']+)$/i.test(value)?value:"";
  }
  function normalizeState(raw) {
    if (raw===null||raw===undefined) return null;
    if (!plain(raw)) throw new Error("Baseball Card state must be an object.");
    var s=clone(raw);s.version=2;s.fields=plain(s.fields)?s.fields:{};
    fieldIds.forEach(function(k){s.fields[k]=text(s.fields[k]);});
    s.gender=text(s.gender);s.criminalHistory=normalizeHistory(s.criminalHistory);s.content=normalizeContent(s.content);
    s.layout=normalizeLayout(s.layout||s.style);s.photoAdjustments=normalizePhotoAdjustments(s.photoAdjustments);
    s.photoDataUrl=text(s.photoDataUrl);s.photoMediaId=text(s.photoMediaId);s.savedAt=text(s.savedAt);
    if(s.photoDataUrl&&!safePhoto(s.photoDataUrl)) throw new Error("Baseball Card photo must be a supported image data URL or local media URL.");
    if(s.renderedPhotoDataUrl&&!safePhoto(s.renderedPhotoDataUrl)) throw new Error("Rendered Baseball Card photo is invalid.");
    s.contentEdited=s.contentEdited===true;
    return s;
  }
  function sortCriminalHistory(rows,direction) {
    return normalizeHistory(rows).map(function(row,index){return {row:row,index:index,date:/^\d{4}-\d{2}-\d{2}$/.test(row.convictionDate)?row.convictionDate:""};}).sort(function(a,b){
      if (!!a.date!==!!b.date) return a.date?-1:1;
      var compare=a.date.localeCompare(b.date);return compare?(direction==="descending"?-compare:compare):a.index-b.index;
    }).map(function(item){return item.row;});
  }
  function titleCase(value) {
    return text(value).toLocaleLowerCase("en-US").replace(/(^|[\s.'’\u002d])(\p{L})/gu,function(_,a,b){return a+b.toLocaleUpperCase("en-US");}).replace(/(^|[\s-])Mc(\p{L})/gu,function(_,a,b){return a+"Mc"+b.toLocaleUpperCase("en-US");});
  }
  function surname(value) {
    var cleaned=text(value).trim().replace(/\s+/g," ").replace(/\s*-\s*/g,"-");
    var parts=cleaned.indexOf("-")>=0?cleaned.split("-").filter(Boolean):cleaned.split(" ");
    var full=(cleaned.indexOf("-")>=0||parts.length===2)?parts.map(function(p,i){return i?titleCase(p):p.toUpperCase();}).join("-"):cleaned.toUpperCase();
    return {formatted:full,primary:full.split("-")[0]||"THE SUBJECT"};
  }
  var months=["January","February","March","April","May","June","July","August","September","October","November","December"];
  function formatDate(value) {var m=text(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);return m&&months[+m[2]-1]?months[+m[2]-1]+" "+(+m[3])+", "+m[1]:text(value).trim();}
  function formatANumber(value) {var digits=text(value).replace(/\D/g,"").slice(0,9);return digits?"A"+[digits.slice(0,3),digits.slice(3,6),digits.slice(6)].filter(Boolean).join(" "):"";}
  function generateContent(raw) {
    var s=normalizeState(raw||{}),f=s.fields,last=surname(f.baseballLastName),name=[titleCase(f.baseballFirstName),last.formatted].filter(Boolean).join(" ");
    var a=formatANumber(f.baseballAlienNumber),description=[f.baseballAge?f.baseballAge+"-year-old":"",f.baseballCountry?"citizen and national of "+f.baseballCountry:""].filter(Boolean).join(" ");
    var lead=name?"ICE Dallas arrested "+name:"ICE Dallas arrested the subject";
    if(a)lead+=", "+a;if(description)lead+=", a "+description;var sentences=[lead+"."];
    var order=formatDate(f.baseballFinalOrderDate),first=formatDate(f.baseballFirstDeportationDate),lastDate=formatDate(f.baseballLastDeportationDate);
    if(order)sentences.push(last.primary+" was ordered removed by an IJ on "+order+".");
    if(first&&lastDate)sentences.push(last.primary+" was initially deported on "+first+", and more recently deported on "+lastDate+".");
    else if(first)sentences.push(last.primary+" was initially deported on "+first+".");else if(lastDate)sentences.push(last.primary+" was most recently deported on "+lastDate+".");
    var crimes=[];s.criminalHistory.forEach(function(row){if(!row.charge)return;var places=[],j=titleCase(row.jurisdiction);
      if(j)places.push(row.jurisdictionType==="County"&&!/\bCounty$/i.test(j)?j+" County":j);
      if(row.state)places.push(/^[a-z]{2}$/i.test(row.state)?row.state.toUpperCase():titleCase(row.state));
      var location=places.length?" in "+places.join(", "):"";if(row.court)location+=location?" ("+row.court+")":" in "+row.court;
      var date=formatDate(row.convictionDate),pronoun=s.gender==="Male"?"he":s.gender==="Female"?"she":"the subject";
      crimes.push(last.primary+" has a criminal history of "+row.charge+location+(date?", for which "+pronoun+" was convicted on "+date:"")+".");
    });sentences=sentences.concat(crimes);
    var disposition=f.baseballDisposition?last.primary+" is now being processed under "+f.baseballDisposition+".":"";if(disposition)sentences.push(disposition);
    var identity=[name,a,description?"a "+description:""].filter(Boolean).join(", ");
    var bullets=[last.primary+" has no T/U/VAWA visa applications.",identity?identity+".":""].concat(crimes,[disposition,f.baseballArrestDate?"Arrested on "+formatDate(f.baseballArrestDate)+".":"","Photo from arrest in the field."]).filter(Boolean);
    return {narrative:sentences.join(" "),heading:"INTERNAL Background Required for Privacy Review:",bullets:bullets};
  }
  function decodeEntities(value) {return text(value).replace(/&#(x[0-9a-f]+|\d+);/ig,function(_,n){var cp=n[0].toLowerCase()==="x"?parseInt(n.slice(1),16):+n;return cp>=0&&cp<=1114111?String.fromCodePoint(cp):"";}).replace(/&(amp|lt|gt|quot|apos|nbsp);/g,function(_,n){return {amp:"&",lt:"<",gt:">",quot:'"',apos:"'",nbsp:" "}[n];});}
  function htmlText(value) {return decodeEntities(text(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/ig,"").replace(/<style\b[^>]*>[\s\S]*?<\/style>/ig,"").replace(/<[^>]*>/g,"")).trim();}
  function legacyContent(card) {
    var html=text(card.html),p=html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i),h=html.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i),li=[],m,re=/<li\b[^>]*>([\s\S]*?)<\/li>/ig;
    while((m=re.exec(html)))li.push(htmlText(m[1]));
    if(p||h||li.length)return {narrative:p?htmlText(p[1]):text(card.text),heading:h?htmlText(h[1]):"",bullets:li};
    return card.text||html?{narrative:text(card.text)||htmlText(html),heading:"",bullets:[]}:null;
  }
  function fromCanonical(card) {
    if (!plain(card)) return normalizeState({});
    var raw=plain(card.state)?clone(card.state):clone(card);
    if(!plain(raw.fields))raw.fields={};
    if(!own(raw.fields,"baseballArrestDate"))raw.fields.baseballArrestDate=text(card.arrestDate);
    if(!own(raw.fields,"baseballDisposition"))raw.fields.baseballDisposition=text(card.disposition);
    if(!own(raw,"photoMediaId"))raw.photoMediaId=text(card.photoMediaId);
    if(!own(raw,"content")||raw.content===null)raw.content=legacyContent(card);
    return normalizeState(raw);
  }
  function escapeHtml(value) {return text(value).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  function contentFor(state) {return state.content||generateContent(state);}
  function plainText(raw) {var s=normalizeState(raw||{}),c=contentFor(s);return ["Dallas","",c.narrative.trim(),"",c.heading.trim()].concat(c.bullets.map(function(b){return "• "+b.trim();})).join("\n").trim();}
  function photoStyle(raw) {var p=normalizePhotoAdjustments(raw);return {objectPosition:p.positionX+"% "+p.positionY+"%",transform:"rotate("+p.rotation+"deg) scale("+(p.flipX?-p.zoom:p.zoom)+", "+p.zoom+")",filter:"brightness("+p.brightness+"%) contrast("+p.contrast+"%)"};}
  function renderEmail(raw,renderedPhotoDataUrl) {
    var s=normalizeState(raw||{}),c=contentFor(s),l=s.layout,border=l.lineWidthPx+"px "+l.lineStyle+" "+l.lineColor;
    var prepared=arguments.length>1||!!s.renderedPhotoDataUrl,photo=safePhoto(arguments.length>1?renderedPhotoDataUrl:s.renderedPhotoDataUrl||s.photoDataUrl),p=photoStyle(s.photoAdjustments),width=Math.round(l.cardWidthPx*l.photoWidthPercent/100);
    var font=escapeHtml(l.fontFamily||fonts[0]),lineHeight=l.lineHeight||1.45;
    var image=photo?'<img src="'+escapeHtml(photo)+'" alt="Photo from arrest in the field" width="'+width+'" height="'+l.photoHeightPx+'" style="display:block;width:100%;height:'+l.photoHeightPx+'px;max-width:none;border:0;'+(prepared?'':'object-fit:cover;object-position:'+p.objectPosition+';transform:'+p.transform+';transform-origin:center center;filter:'+p.filter+';')+'">':'<div role="img" aria-label="No arrest photo selected" style="height:'+l.photoHeightPx+'px;background:#fff;"></div>';
    return '<table class="arrest-card" role="presentation" aria-label="ICE Dallas arrest information card" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;max-width:'+l.cardWidthPx+'px;margin:0;border-collapse:collapse;table-layout:fixed;background:#ffffff;font-family:'+font+';color:#171717;line-height:'+lineHeight+';"><tbody><tr>'+ 
      '<td class="photo-cell" rowspan="2" width="'+l.photoWidthPercent+'%" height="'+l.photoHeightPx+'" style="width:'+l.photoWidthPercent+'%;height:'+l.photoHeightPx+'px;padding:0;overflow:hidden;border:'+border+';vertical-align:top;background:#ffffff;"><div class="photo-frame" style="position:relative;width:100%;height:'+l.photoHeightPx+'px;overflow:hidden;background:#fff;">'+image+'</div></td>'+
      '<th class="city-row" scope="row" height="'+l.headerHeightPx+'" style="height:'+l.headerHeightPx+'px;padding:9px 16px;border:'+border+';text-align:left;vertical-align:middle;font-size:'+l.headerFontSizePx+'px;line-height:1.2;font-weight:700;background:#ffffff;">Dallas</th></tr><tr>'+
      '<td class="narrative-cell" style="padding:'+l.contentPaddingPx+'px;border:'+border+';vertical-align:top;font-size:'+l.contentFontSizePx+'px;background:#ffffff;"><p style="margin:0 0 20px;padding:0;color:#171717;">'+escapeHtml(c.narrative)+'</p><h2 style="margin:4px 0 12px;padding:0;font-size:'+l.contentFontSizePx+'px;line-height:1.35;font-weight:700;">'+escapeHtml(c.heading)+'</h2><ul style="margin:0;padding:0 0 0 24px;max-height:none;overflow:visible;">'+c.bullets.map(function(item,i){return '<li style="margin:'+(i?'9px':'0')+' 0 0;padding:0;">'+escapeHtml(item)+'</li>';}).join("")+'</ul></td></tr></tbody></table>';
  }
  function toCanonical(raw,context) {
    context=context||{};var state=normalizeState(raw||{}),card=clone(context.existing||{});
    Object.keys(context).forEach(function(k){if(k!=="existing")card[k]=clone(context[k]);});
    if(own(context,"photoMediaId"))state.photoMediaId=text(context.photoMediaId);
    card.state=state;card.version=2;card.fields=clone(state.fields);card.gender=state.gender;card.criminalHistory=clone(state.criminalHistory);card.content=clone(state.content);card.contentEdited=state.contentEdited;
    card.layout=clone(state.layout);card.photoAdjustments=clone(state.photoAdjustments);card.photoDataUrl=state.photoDataUrl;card.photoMediaId=state.photoMediaId;card.savedAt=state.savedAt;
    card.arrestDate=state.fields.baseballArrestDate;card.disposition=state.fields.baseballDisposition;
    card.text=plainText(state);card.html=renderEmail(state);card.status=context.status||"SAVED";
    ["foreignWarrantsKnown","hasForeignWarrants","foreignWarrantCountry"].forEach(function(k){if(own(state,k))card[k]=clone(state[k]);});
    return card;
  }
  function stable(value) {if(Array.isArray(value))return "["+value.map(stable).join(",")+"]";if(plain(value))return "{"+Object.keys(value).sort().filter(function(k){return value[k]!==undefined;}).map(function(k){return JSON.stringify(k)+":"+stable(value[k]);}).join(",")+"}";return JSON.stringify(value);}
  // Deterministic source-change marker, not an authentication/security checksum.
  function fingerprint(raw) {var s=normalizeState(raw||{}),h=2166136261;["savedAt","generatedAt","sourceFingerprint","renderedPhotoDataUrl","finalizedSnapshot"].forEach(function(k){delete s[k];});var data=stable(s);for(var i=0;i<data.length;i++){h^=data.charCodeAt(i);h=Math.imul(h,16777619);}return "fnv1a32:"+(h>>>0).toString(16).padStart(8,"0");}
  function deepFreeze(o) {if(o&&typeof o==="object"){Object.keys(o).forEach(function(k){deepFreeze(o[k]);});Object.freeze(o);}return o;}
  function finalize(raw,context) {
    var s=normalizeState(raw||{}),c=context||{},date=text(c.arrestDateKey||s.fields.baseballArrestDate);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!contentFor(s).narrative.trim())throw new Error("A finalized Baseball Card requires an arrest date and narrative.");
    if(!s.photoDataUrl&&!s.photoMediaId&&!c.photoMediaId)throw new Error("A finalized Baseball Card requires a saved arrest photo.");
    var result=Object.assign({},s,clone(c),{version:2,status:"FINALIZED",arrestDateKey:date,content:clone(contentFor(s)),sourceFingerprint:fingerprint(s),generatedAt:text(c.generatedAt)||new Date().toISOString()});
    result.recordId=text(c.recordId||c.bookinRecordId);result.bookinRecordId=text(c.bookinRecordId||c.recordId);result.displayName=text(c.displayName)||[titleCase(s.fields.baseballFirstName),surname(s.fields.baseballLastName).formatted].filter(Boolean).join(" ")||"Unnamed subject";
    return deepFreeze(result);
  }
  function renderPhoto(raw,source,environment) {
    var s=normalizeState(raw||{}),url=safePhoto(source===undefined?s.photoDataUrl:source),env=environment||{},doc=env.document||root.document,ImageClass=env.Image||root.Image;
    if(!url)return Promise.resolve("");
    if(!doc||typeof doc.createElement!=="function"||!ImageClass)return Promise.reject(new Error("Photo rendering is unavailable; the adjusted card was not copied."));
    return new Promise(function(resolve,reject){
      var img=new ImageClass();img.onerror=function(){reject(new Error("The saved arrest photo could not be rendered."));};
      img.onload=function(){try{
        var canvas=doc.createElement("canvas"),crop=doc.createElement("canvas"),l=s.layout,p=s.photoAdjustments,w=Math.round(l.cardWidthPx*l.photoWidthPercent/100),h=l.photoHeightPx;
        canvas.width=crop.width=w;canvas.height=crop.height=h;
        var ctx=canvas.getContext("2d"),cropCtx=crop.getContext("2d");if(!ctx||!cropCtx)throw new Error("Photo canvas is unavailable.");
        var iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height;if(!iw||!ih)throw new Error("Photo dimensions are invalid.");
        // CSS object-fit clips the replaced image before transforming its box.
        // Cropping first prevents a rotation from revealing pixels outside that box.
        var nativeFilter="filter" in cropCtx;if(nativeFilter)cropCtx.filter="brightness("+p.brightness+"%) contrast("+p.contrast+"%)";
        var cover=Math.max(w/iw,h/ih),dw=iw*cover,dh=ih*cover;
        cropCtx.drawImage(img,(w-dw)*p.positionX/100,(h-dh)*p.positionY/100,dw,dh);
        if(!nativeFilter&&(p.brightness!==100||p.contrast!==100)){
          if(!cropCtx.getImageData||!cropCtx.putImageData)throw new Error("Photo brightness and contrast could not be rendered.");
          var pixels=cropCtx.getImageData(0,0,w,h),brightness=p.brightness/100,contrast=p.contrast/100;
          for(var i=0;i<pixels.data.length;i+=4)if(pixels.data[i+3])for(var channel=0;channel<3;channel++)pixels.data[i+channel]=Math.max(0,Math.min(255,((pixels.data[i+channel]*brightness/255-0.5)*contrast+0.5)*255));
          cropCtx.putImageData(pixels,0,0);
        }
        ctx.fillStyle="#ffffff";ctx.fillRect(0,0,w,h);ctx.save();ctx.translate(w/2,h/2);ctx.rotate(p.rotation*Math.PI/180);ctx.scale(p.flipX?-p.zoom:p.zoom,p.zoom);
        ctx.drawImage(crop,-w/2,-h/2,w,h);ctx.restore();
        var result=canvas.toDataURL("image/png");if(!safePhoto(result))throw new Error("Photo rendering returned invalid output.");resolve(result);
      }catch(error){reject(error);}};img.src=url;
    });
  }
  app.baseball=Object.assign(app.baseball||{},{normalizeState:normalizeState,fromCanonical:fromCanonical,toCanonical:toCanonical,normalizeLayout:normalizeLayout,normalizePhotoAdjustments:normalizePhotoAdjustments,sortCriminalHistory:sortCriminalHistory,generateContent:generateContent,renderEmail:renderEmail,plainText:plainText,photoStyle:photoStyle,renderPhoto:renderPhoto,finalize:finalize,fingerprint:fingerprint,defaultLayout:defaultLayout,defaultPhotoAdjustments:defaultPhotoAdjustments,layoutPresets:layoutPresets,fieldIds:fieldIds});
})(typeof window!=="undefined"?window:globalThis);
