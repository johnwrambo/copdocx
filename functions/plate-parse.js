/**
 * Parse license plates from paste or a text/CSV file.
 * Kind tag (plate-check) queue only.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var STATES = {
    AL: 1, AK: 1, AZ: 1, AR: 1, CA: 1, CO: 1, CT: 1, DC: 1, DE: 1, FL: 1,
    GA: 1, HI: 1, IA: 1, ID: 1, IL: 1, IN: 1, KS: 1, KY: 1, LA: 1, MA: 1,
    MD: 1, ME: 1, MI: 1, MN: 1, MO: 1, MS: 1, MT: 1, NC: 1, ND: 1, NE: 1,
    NH: 1, NJ: 1, NM: 1, NV: 1, NY: 1, OH: 1, OK: 1, OR: 1, PA: 1, RI: 1,
    SC: 1, SD: 1, TN: 1, TX: 1, UT: 1, VA: 1, VT: 1, WA: 1, WI: 1, WV: 1,
    WY: 1
  };

  function isState(token) {
    return !!STATES[String(token || "").toUpperCase()];
  }

  function normalizePlate(token) {
    return String(token || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  }

  function isPlate(token) {
    var plate = normalizePlate(token);
    return plate.length >= 1 && plate.length <= 8;
  }

  function plateKey(state, plate) {
    return String(state || "").toUpperCase() + "|" + normalizePlate(plate);
  }

  function splitTokens(text) {
    return String(text || "")
      .replace(/\r\n?/g, "\n")
      .split(/[\n,;|\t]+/)
      .map(function (chunk) {
        return chunk.trim();
      })
      .filter(Boolean)
      .reduce(function (out, chunk) {
        var dashed = /^([A-Za-z]{2})[- ]+(.+)$/.exec(chunk);
        if (dashed && isState(dashed[1]) && isPlate(dashed[2])) {
          out.push(dashed[1].toUpperCase(), normalizePlate(dashed[2]));
          return out;
        }
        chunk.split(/\s+/).forEach(function (bit) {
          if (bit) {
            out.push(bit);
          }
        });
        return out;
      }, []);
  }

  function parse(text, existingKeys) {
    var seen = {};
    (existingKeys || []).forEach(function (key) {
      if (key) {
        seen[key] = true;
      }
    });
    var tokens = splitTokens(text);
    var rows = [];
    var kept = 0;
    var dupes = 0;
    var bad = 0;
    var i = 0;
    function pushRow(state, rawPlate) {
      var plate = normalizePlate(rawPlate);
      if (!isPlate(plate)) {
        bad += 1;
        return;
      }
      var st = isState(state) ? String(state).toUpperCase() : "";
      var key = plateKey(st, plate);
      if (seen[key]) {
        dupes += 1;
        return;
      }
      seen[key] = true;
      rows.push({ plate: plate, state: st, key: key });
      kept += 1;
    }
    while (i < tokens.length) {
      var cur = tokens[i];
      var next = tokens[i + 1];
      var pair = /^([A-Za-z]{2})-(.+)$/.exec(cur);
      if (pair && isState(pair[1]) && isPlate(pair[2])) {
        pushRow(pair[1], pair[2]);
        i += 1;
      } else if (isState(cur) && next && isPlate(next) && !isState(next)) {
        pushRow(cur, next);
        i += 2;
      } else if (isPlate(cur) && next && isState(next)) {
        pushRow(next, cur);
        i += 2;
      } else if (isPlate(cur)) {
        pushRow("", cur);
        i += 1;
      } else {
        bad += 1;
        i += 1;
      }
    }
    return { rows: rows, kept: kept, dupes: dupes, bad: bad };
  }

  root.plates = {
    parse: parse,
    plateKey: plateKey,
    normalizePlate: normalizePlate,
    isState: isState
  };
})(typeof window !== "undefined" ? window : globalThis);
