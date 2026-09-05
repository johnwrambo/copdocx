/**
 * Optimized US Address Parse + Validate + Geocode for lead-entry forms.
 * Drop-in replacement. Paste full address into Street to auto-fill city/state/ZIP/unit.
 * Blur/input normalizes capitalization, state codes, ZIP, street types.
 * Supports PO Box, Rural Route, Military (APO/FPO/DPO + AA/AE/AP), common units & street types.
 *
 * Public API (via AddressUtils or globals for backward compat):
 *   parseAddress, validateAddress, formatFullAddress, normalizeState, normalizeZip,
 *   formatStreetLine, normalizeUnit, getAddressType, isPOBox, isRuralRoute, isMilitary,
 *   applyAddressValidation, mapAddress, clearAddressFields, attachAddressValidation,
 *   openAddressInGoogleMaps, geocodeAddress, formatAddressQuery
 */

(function (global) {
  "use strict";

  // ===== Constants (precomputed once) =====
  const ADDRESS_STATE_NAMES = {
    alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
    colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
    hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS",
    kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA",
    michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT",
    nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
    "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND",
    ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
    "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX",
    utah: "UT", vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV",
    wisconsin: "WI", wyoming: "WY",
    "district of columbia": "DC", "washington dc": "DC", "washington d.c.": "DC",
    "puerto rico": "PR", "virgin islands": "VI", guam: "GU",
    "american samoa": "AS", "northern mariana islands": "MP",
    // Military
    "armed forces americas": "AA", "armed forces europe": "AE", "armed forces pacific": "AP",
    aa: "AA", ae: "AE", ap: "AP"
  };

  const STREET_TYPE_DISPLAY = {
    aly: "Aly", alley: "Aly",
    anx: "Anx", annex: "Anx", anex: "Anx",
    arc: "Arc", arcade: "Arc",
    ave: "Ave", avenue: "Ave", av: "Ave",
    blvd: "Blvd", boulevard: "Blvd",
    bnd: "Bnd", bend: "Bnd",
    br: "Br", branch: "Br",
    brg: "Brg", bridge: "Brg",
    brk: "Brk", brook: "Brk",
    byp: "Byp", bypass: "Byp",
    cir: "Cir", circle: "Cir",
    ct: "Ct", court: "Ct",
    ctr: "Ctr", center: "Ctr", centre: "Ctr",
    cv: "Cv", cove: "Cv",
    cyn: "Cyn", canyon: "Cyn",
    cswy: "Cswy", causeway: "Cswy",
    dr: "Dr", drive: "Dr",
    expy: "Expy", expressway: "Expy",
    ext: "Ext", extension: "Ext",
    fwy: "Fwy", freeway: "Fwy",
    grv: "Grv", grove: "Grv",
    hbr: "Hbr", harbor: "Hbr",
    hts: "Hts", heights: "Hts",
    hwy: "Hwy", highway: "Hwy",
    jct: "Jct", junction: "Jct",
    ln: "Ln", lane: "Ln",
    loop: "Loop",
    mdw: "Mdw", meadow: "Mdw",
    mnr: "Mnr", manor: "Mnr",
    mtn: "Mtn", mountain: "Mtn",
    opas: "Opas", overpass: "Opas",
    park: "Park",
    pass: "Pass", path: "Path",
    pkwy: "Pkwy", parkway: "Pkwy",
    pl: "Pl", place: "Pl",
    plz: "Plz", plaza: "Plz",
    pt: "Pt", point: "Pt",
    rd: "Rd", road: "Rd",
    rdg: "Rdg", ridge: "Rdg",
    rte: "Rte", route: "Rte",
    sq: "Sq", square: "Sq",
    st: "St", street: "St",
    sta: "Sta", station: "Sta",
    ter: "Ter", terrace: "Ter",
    trce: "Trce", trace: "Trce",
    trl: "Trl", trail: "Trl",
    tpke: "Tpke", turnpike: "Tpke",
    via: "Via", viaduct: "Via",
    vlg: "Vlg", village: "Vlg",
    vly: "Vly", valley: "Vly",
    vw: "Vw", view: "Vw",
    way: "Way",
    xing: "Xing", crossing: "Xing"
  };

  const STREET_DIRECTION_DISPLAY = {
    n: "N", s: "S", e: "E", w: "W",
    ne: "NE", nw: "NW", se: "SE", sw: "SW",
    north: "N", south: "S", east: "E", west: "W",
    northeast: "NE", northwest: "NW", southeast: "SE", southwest: "SW"
  };

  const UNIT_DESIGNATOR_MAP = {
    apt: "Apt", apartment: "Apt",
    ste: "Ste", suite: "Ste",
    unit: "Unit",
    bldg: "Bldg", building: "Bldg",
    fl: "Fl", floor: "Fl",
    rm: "Rm", room: "Rm",
    dept: "Dept", department: "Dept",
    spc: "Spc", space: "Spc",
    lot: "Lot",
    trlr: "Trlr", trailer: "Trlr",
    slip: "Slip",
    stop: "Stop",
    hngr: "Hngr", hangar: "Hngr", hanger: "Hngr",
    ofc: "Ofc", office: "Ofc",
    ph: "Ph", penthouse: "Ph"
  };

  // Precomputes
  const SORTED_STATE_NAMES = Object.keys(ADDRESS_STATE_NAMES).sort((a, b) => b.length - a.length);
  const STATE_CODE_SET = new Set(Object.values(ADDRESS_STATE_NAMES).map((c) => c.toUpperCase()));

  const UNIT_RE =
    /(?:^|\s)((?:apt|apartment|suite|ste|unit|bldg|building|fl|floor|rm|room|dept|department|spc|space|lot|trlr|trailer|slip|stop|hngr|hangar|hanger|ofc|office|ph|penthouse)\.?\s*#?\s*[A-Za-z0-9-]+|#\s*[A-Za-z0-9-]+)\b/i;

  const MILITARY_STATE_CODES = { AA: true, AE: true, AP: true };
  const MILITARY_CITIES = { APO: true, FPO: true, DPO: true };

  // ===== Pure helpers =====

  function addressStateEntries() {
    if (typeof global.US_STATES !== "undefined" && Array.isArray(global.US_STATES)) {
      return global.US_STATES.filter((s) => s && s.active !== false && s.code);
    }
    return Object.keys(ADDRESS_STATE_NAMES).map((name) => ({
      code: ADDRESS_STATE_NAMES[name],
      label: name
    }));
  }

  function normalizeState(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const upper = raw.toUpperCase().replace(/\./g, "");
    if (STATE_CODE_SET.has(upper)) return upper;
    if (MILITARY_STATE_CODES[upper]) return upper;
    const named = ADDRESS_STATE_NAMES[raw.toLowerCase().replace(/\./g, "")];
    return named || "";
  }

  function normalizeZip(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (digits.length === 5) return digits;
    if (digits.length === 9) return digits.slice(0, 5) + "-" + digits.slice(5);
    return "";
  }

  function capitalizeAddressWord(word) {
    const cleaned = String(word || "").trim();
    if (!cleaned) return "";
    const key = cleaned.toLowerCase().replace(/\./g, "");
    if (STREET_DIRECTION_DISPLAY[key]) return STREET_DIRECTION_DISPLAY[key];
    if (STREET_TYPE_DISPLAY[key]) return STREET_TYPE_DISPLAY[key];
    if (/^\d+(st|nd|rd|th)$/i.test(cleaned)) return cleaned.toLowerCase();
    // PO Box special
    if (key === "po" || key === "p.o" || key === "p.o.") return "PO";
    if (key === "box") return "Box";
    if (/^mc/i.test(cleaned) && cleaned.length > 2) {
      return "Mc" + capitalizeAddressWord(cleaned.slice(2));
    }
    if (/^mac/i.test(cleaned) && cleaned.length > 3) {
      return "Mac" + capitalizeAddressWord(cleaned.slice(3));
    }
    if (/^(o|d|l)'/i.test(cleaned) && cleaned.length > 2) {
      const prefix = cleaned.charAt(0).toUpperCase() + "'";
      return prefix + capitalizeAddressWord(cleaned.slice(2));
    }
    if (["van", "von", "de", "da", "di", "la", "le", "du"].includes(key)) {
      return key.charAt(0).toUpperCase() + key.slice(1);
    }
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
  }

  function formatStreetLine(value) {
    return String(value || "")
      .replace(/[\t\n\r]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean)
      .map(capitalizeAddressWord)
      .join(" ");
  }

  function formatCityName(value) {
    return formatStreetLine(value);
  }

  function formatStreetLineLive(value) {
    const raw = String(value || "");
    const trailingSpace = /\s$/.test(raw);
    const formatted = formatStreetLine(raw);
    if (!formatted) {
      return "";
    }
    return formatted + (trailingSpace ? " " : "");
  }

  function formatZipLive(value) {
    const digits = String(value || "").replace(/\D/g, "").slice(0, 9);
    if (!digits) {
      return "";
    }
    if (digits.length <= 5) {
      return digits;
    }
    return digits.slice(0, 5) + "-" + digits.slice(5);
  }

  function rewriteLiveField(el, next) {
    if (!el) {
      return;
    }
    const before = String(el.value || "");
    if (next === before) {
      return;
    }
    const atEnd =
      el.selectionStart === before.length && el.selectionEnd === before.length;
    el.value = next;
    if (atEnd && typeof el.setSelectionRange === "function") {
      el.setSelectionRange(next.length, next.length);
    }
  }

  function clearFieldInvalid(el) {
    if (!el) {
      return;
    }
    el.classList.remove("is-invalid");
    el.removeAttribute("title");
    el.removeAttribute("aria-invalid");
  }

  /** input: mask/title-case this field only. No error UI. */
  function liveFormatAddressField(el, name) {
    if (!el) {
      return;
    }
    const raw = el.value;
    if (name === "zip") {
      rewriteLiveField(el, formatZipLive(raw));
    } else if (name === "state") {
      const named = normalizeState(String(raw || "").trim());
      rewriteLiveField(el, named || formatStreetLineLive(raw));
    } else if (name === "street2") {
      const trailingSpace = /\s$/.test(raw);
      const unit = normalizeUnit(raw) || formatStreetLine(raw);
      rewriteLiveField(el, unit ? unit + (trailingSpace ? " " : "") : "");
    } else if (name === "street" || name === "city") {
      rewriteLiveField(el, formatStreetLineLive(raw));
    }
    clearFieldInvalid(el);
  }

  function normalizeUnit(rawUnit) {
    if (!rawUnit) return "";
    let u = String(rawUnit).replace(/\s+/g, " ").trim();
    const hashMatch = u.match(/^#\s*([A-Za-z0-9-]+)$/i);
    if (hashMatch) return "#" + hashMatch[1].toUpperCase();
    const m = u.match(
      /^(apt|apartment|suite|ste|unit|bldg|building|fl|floor|rm|room|dept|department|spc|space|lot|trlr|trailer|slip|stop|hngr|hangar|hanger|ofc|office|ph|penthouse)\.?\s*#?\s*([A-Za-z0-9-]+)$/i
    );
    if (m) {
      const des = UNIT_DESIGNATOR_MAP[m[1].toLowerCase()] || capitalizeAddressWord(m[1]);
      const num = m[2].toUpperCase();
      return des + " " + num;
    }
    return formatStreetLine(u);
  }

  function isPOBox(street) {
    return /^(p\.?\s*o\.?\s*box|post\s*office\s*box|po\s*box|pobox)\b/i.test(
      String(street || "").trim()
    );
  }

  function isRuralRoute(street) {
    return /^(rr|r\.?\s*r\.?|rural\s*route|hc|h\.?\s*c\.?|highway\s*contract)\b/i.test(
      String(street || "").trim()
    );
  }

  function isMilitary(components) {
    if (!components) return false;
    const state = String(components.state || "").toUpperCase();
    const city = String(components.city || "")
      .toUpperCase()
      .replace(/\./g, "")
      .trim();
    return !!(MILITARY_STATE_CODES[state] || MILITARY_CITIES[city]);
  }

  function getAddressType(components) {
    if (!components) return "incomplete";
    const hasCore =
      components.street && components.city && components.state && components.zip;
    if (!hasCore) return "incomplete";
    if (isMilitary(components)) return "military";
    if (isPOBox(components.street)) return "po_box";
    if (isRuralRoute(components.street)) return "rural";
    return "street";
  }

  function emptyComponents() {
    return {
      street: "",
      street2: "",
      city: "",
      state: "",
      zip: "",
      latitude: "",
      longitude: ""
    };
  }

  /**
   * Parse a free-form US address string into components.
   * Handles comma and no-comma formats, units, PO Box, military, multi-line.
   */
  function parseAddress(input) {
    const raw = String(input || "")
      .replace(/[\t\n\r]+/g, ", ")
      .replace(/\s+/g, " ")
      .trim();

    const components = { street: "", street2: "", city: "", state: "", zip: "" };
    if (!raw) {
      return { raw, components, isComplete: false, addressType: "incomplete" };
    }

    let working = raw
      .replace(/,?\s*(USA|United States|U\.S\.A?\.?)\.?$/i, "")
      .trim();

    // 1. ZIP from end
    const zipMatch = working.match(/\b(\d{5})(?:[-\s]?(\d{4}))?\s*$/);
    if (zipMatch) {
      components.zip = zipMatch[2]
        ? zipMatch[1] + "-" + zipMatch[2]
        : zipMatch[1];
      working = working.slice(0, zipMatch.index).trim().replace(/,\s*$/, "");
    }

    // 2. State from end
    // Prefer isolated 2-letter code (word boundary) so "California" is not misread as "IA".
    // Then try full state names (longest first). Avoid consuming city names that appear in aliases.
    {
      const stateMatch = working.match(/(?:^|[\s,])([A-Za-z]{2})$/);
      if (stateMatch && normalizeState(stateMatch[1])) {
        components.state = normalizeState(stateMatch[1]);
        const codeStart = working.length - 2;
        working = working.slice(0, codeStart).trim().replace(/,\s*$/, "");
      } else {
        const lower = working.toLowerCase();
        for (const name of SORTED_STATE_NAMES) {
          // Require the name to be preceded by a separator or start, and prefer longer matches
          if (
            (lower.endsWith(", " + name) || lower === name || lower.endsWith(" " + name)) &&
            (lower.length === name.length || /[\s,]/.test(lower[lower.length - name.length - 1] || " "))
          ) {
            components.state = ADDRESS_STATE_NAMES[name];
            working = working
              .slice(0, lower.lastIndexOf(name))
              .trim()
              .replace(/,\s*$/, "");
            break;
          }
        }
      }
    }

    // 3. Extract unit first (can appear before city in no-comma pastes)
    const unitMatch = working.match(UNIT_RE);
    if (unitMatch) {
      components.street2 = normalizeUnit(unitMatch[1] || unitMatch[0]);
      working = working.replace(unitMatch[0], " ").replace(/\s+/g, " ").trim();
    }

    // 4. City via last comma, or heuristic for no-comma
    const lastComma = working.lastIndexOf(",");
    if (lastComma !== -1) {
      components.city = working.slice(lastComma + 1).trim();
      working = working.slice(0, lastComma).trim();
    } else {
      // Special military city-only remaining
      const milCity = working.toUpperCase().replace(/\./g, "").trim();
      if (MILITARY_CITIES[milCity] && components.state && components.zip) {
        components.city = milCity;
        working = "";
      } else {
        const tokens = working.split(/\s+/).filter(Boolean);
        if (tokens.length >= 2 && components.state && components.zip) {
          let splitAt = -1;
          // Prefer street-type boundary, then optional post-directional, rest = city
          for (let i = tokens.length - 1; i >= 0; i--) {
            const t = tokens[i].toLowerCase().replace(/\./g, "");
            if (STREET_TYPE_DISPLAY[t]) {
              // consume optional post-dir after the type
              let end = i + 1;
              if (end < tokens.length) {
                const next = tokens[end].toLowerCase().replace(/\./g, "");
                if (STREET_DIRECTION_DISPLAY[next]) {
                  end += 1;
                }
              }
              splitAt = end;
              break;
            }
          }
          // if no street-type found, try last directional as weak boundary
          if (splitAt < 0) {
            for (let i = tokens.length - 1; i >= 1; i--) {
              const t = tokens[i].toLowerCase().replace(/\./g, "");
              if (STREET_DIRECTION_DISPLAY[t]) {
                splitAt = i + 1;
                break;
              }
            }
          }
          if (splitAt > 0 && splitAt < tokens.length) {
            components.city = tokens.slice(splitAt).join(" ");
            working = tokens.slice(0, splitAt).join(" ");
          } else if (tokens.length >= 3) {
            // Fallback: last 1–2 tokens as city if they don't look like numbers or pure street types
            const last = tokens[tokens.length - 1].toLowerCase().replace(/\./g, "");
            if (!STREET_TYPE_DISPLAY[last] && !/^\d+$/.test(last)) {
              // Prefer last single token for common single-word cities; use 2 if second-last also non-type
              const secondLast = tokens[tokens.length - 2].toLowerCase().replace(/\./g, "");
              if (
                tokens.length >= 3 &&
                !STREET_TYPE_DISPLAY[secondLast] &&
                !/^\d+$/.test(secondLast) &&
                !STREET_DIRECTION_DISPLAY[secondLast]
              ) {
                components.city = tokens.slice(-2).join(" ");
                working = tokens.slice(0, -2).join(" ");
              } else {
                components.city = tokens[tokens.length - 1];
                working = tokens.slice(0, -1).join(" ");
              }
            }
          } else if (tokens.length === 1 && !/^\d/.test(tokens[0])) {
            // Single remaining word after state/zip → treat as city (common for short pastes)
            components.city = tokens[0];
            working = "";
          }
        }
      }
    }

    components.street = working
      .replace(/^,+\s*|,+\s*$/g, "")
      .replace(/\s*,\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Format
    components.street = formatStreetLine(components.street);
    components.street2 = components.street2
      ? normalizeUnit(components.street2)
      : "";
    components.city = formatCityName(components.city);
    components.zip = normalizeZip(components.zip) || components.zip;
    components.state = normalizeState(components.state) || components.state;

    const addressType = getAddressType(components);

    return {
      raw,
      components,
      isComplete: !!(
        components.street &&
        components.city &&
        components.state &&
        components.zip
      ),
      addressType
    };
  }

  /**
   * Pure validation. Returns normalized components + errors + addressType.
   */
  function validateAddress(address) {
    address = address || {};
    const street = formatStreetLine(address.street || "");
    const street2 =
      typeof normalizeUnit === "function"
        ? normalizeUnit(address.street2 || "")
        : formatStreetLine(address.street2 || "");
    const city = formatCityName(address.city || "");
    const state = normalizeState(address.state || "");
    const zip = normalizeZip(address.zip || "");

    const errors = [];
    const any = !!(
      address.street ||
      address.street2 ||
      address.city ||
      address.state ||
      address.zip
    );

    if (address.state && !state) {
      errors.push({
        field: "state",
        message: "Enter a valid US state, territory, or military code (AA/AE/AP)"
      });
    } else if (any && !state) {
      errors.push({ field: "state", message: "State is required" });
    }

    if (address.zip && !zip) {
      errors.push({ field: "zip", message: "ZIP must be 5 digits or ZIP+4" });
    } else if (any && !zip) {
      errors.push({ field: "zip", message: "ZIP is required" });
    }

    const streetRaw = String(address.street || "").trim();
    const boxOrRural = isPOBox(streetRaw) || isRuralRoute(streetRaw);
    const mil = isMilitary({ city, state });

    if (
      street &&
      !boxOrRural &&
      !mil &&
      !/^(po|p\.o\.|rr|hc|box|\d)/i.test(street)
    ) {
      errors.push({
        field: "street",
        message: "Street should start with a number, P.O. Box, RR, or HC"
      });
    } else if (any && !street && !mil) {
      errors.push({ field: "street", message: "Street is required" });
    }

    if (any && !city) {
      errors.push({ field: "city", message: "City is required" });
    }

    const normalized = { street, street2, city, state, zip };
    const addressType = getAddressType(normalized);

    return {
      valid: errors.length === 0,
      complete: !!(street && city && state && zip && errors.length === 0),
      errors,
      normalized,
      addressType
    };
  }

  function formatFullAddress(components, opts) {
    opts = opts || {};
    const multiline = !!opts.multiline;
    const includeUnit = opts.includeUnit !== false;
    if (!components) return "";
    const line1 = [
      components.street,
      includeUnit ? components.street2 : ""
    ]
      .filter(Boolean)
      .join(includeUnit && components.street2 ? " " : "");
    const line2 = [components.city, components.state, components.zip]
      .filter(Boolean)
      .join(" ");
    if (multiline) {
      return [line1, line2].filter(Boolean).join("\n");
    }
    return [line1, line2].filter(Boolean).join(", ");
  }

  function formatAddressQuery(address) {
    const normalized =
      address && address.street !== undefined
        ? validateAddress(address).normalized
        : validateAddress(readAddressFields()).normalized;
    return [
      normalized.street,
      normalized.street2,
      normalized.city,
      normalized.state,
      normalized.zip
    ]
      .filter(Boolean)
      .join(", ");
  }

  function formatCoordinate(value) {
    const number = Number(value);
    if (!isFinite(number)) return "";
    return String(Math.round(number * 1000000) / 1000000);
  }

  function formatLatLongPair(lat, lng) {
    const a = String(lat || "").trim();
    const b = String(lng || "").trim();
    if (!a || !b) {
      return "";
    }
    return a + ", " + b;
  }

  /**
   * Combined lat/long field. Empty is allowed.
   * Complete pair → { valid, latitude, longitude, formatted }.
   * Partial / junk → valid:false and a reason (show on blur).
   */
  function validateLatLong(value) {
    const raw = String(value || "").trim();
    const blank = {
      digits: "",
      latitude: "",
      longitude: "",
      formatted: "",
      complete: false,
      valid: true,
      reason: ""
    };
    if (!raw) {
      return blank;
    }
    const parsed = parseLatLong(raw);
    if (parsed.latitude && parsed.longitude) {
      if (Number(parsed.latitude) === 0 && Number(parsed.longitude) === 0) {
        return {
          latitude: parsed.latitude,
          longitude: parsed.longitude,
          formatted: formatLatLongPair(parsed.latitude, parsed.longitude),
          complete: true,
          valid: false,
          reason: "0, 0 is not a real location"
        };
      }
      return {
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        formatted: formatLatLongPair(parsed.latitude, parsed.longitude),
        complete: true,
        valid: true,
        reason: ""
      };
    }
    return {
      latitude: "",
      longitude: "",
      formatted: raw,
      complete: false,
      valid: false,
      reason:
        parsed.error ||
        "Enter both latitude and longitude (32.744582, -97.816176)"
    };
  }

  function googleMapsSearchUrl(query) {
    return (
      "https://www.google.com/maps/search/?api=1&query=" +
      encodeURIComponent(query)
    );
  }

  function pairLooksLikeCoords(latRaw, lngRaw) {
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (!isFinite(lat) || !isFinite(lng)) {
      return null;
    }
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return null;
    }
    if (lat === 0 && lng === 0) {
      return null;
    }
    return {
      latitude: formatCoordinate(lat),
      longitude: formatCoordinate(lng)
    };
  }

  function keepCoordText(raw) {
    const text = String(raw || "")
      .trim()
      .replace(/[\u2212\u2013\u2014]/g, "-");
    if (!/^[+-]?\d+(?:\.\d+)?$/.test(text)) {
      const number = Number(text);
      return isFinite(number) ? String(number) : "";
    }
    return text;
  }

  function signedCoordText(raw, hemi) {
    let text = keepCoordText(raw);
    if (!text) {
      return "";
    }
    const h = String(hemi || "").toUpperCase();
    if (h === "S" || h === "W") {
      return "-" + text.replace(/^[+-]/, "");
    }
    if (h === "N" || h === "E") {
      return text.replace(/^[+-]/, "");
    }
    return text;
  }

  /**
   * Parse a lat/long pair pasted into either coordinate field.
   * "32.74458235328899, -97.81617603781437" fills both.
   */
  function parseLatLong(raw, opts) {
    opts = opts || {};
    const as = opts.as || "";
    const empty = { latitude: "", longitude: "", value: "", error: "" };
    const text = String(raw || "").trim();
    if (!text) {
      return empty;
    }

    let working = text
      .replace(/[\u2212\u2013\u2014]/g, "-")
      .replace(/[()[\]{}]/g, " ")
      .replace(/[°º]/g, "")
      .replace(/\b(lat(?:itude)?|lon(?:g(?:itude)?)?|lng|long)\.?\b[:\s=]*/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    const nsew = working.match(
      /^([+-]?\d+(?:\.\d+)?)\s*([NSns])?\s*[,;/\s]\s*([+-]?\d+(?:\.\d+)?)\s*([EWew])?$/
    );
    const single = working.match(/^([+-]?\d+(?:\.\d+)?)\s*([NSEWnsew])?$/);

    if (nsew) {
      let firstText = signedCoordText(nsew[1], nsew[2]);
      let secondText = signedCoordText(nsew[3], nsew[4]);
      let first = Number(firstText);
      let second = Number(secondText);
      if (Math.abs(first) > 90 && Math.abs(second) <= 90) {
        const swappedText = firstText;
        firstText = secondText;
        secondText = swappedText;
        first = Number(firstText);
        second = Number(secondText);
      }
      if (!isFinite(first) || !isFinite(second)) {
        return {
          latitude: "",
          longitude: "",
          value: "",
          error: "Not a valid latitude/longitude pair."
        };
      }
      if (Math.abs(first) > 90) {
        return {
          latitude: "",
          longitude: "",
          value: "",
          error: "Latitude must be between -90 and 90."
        };
      }
      if (Math.abs(second) > 180) {
        return {
          latitude: "",
          longitude: "",
          value: "",
          error: "Longitude must be between -180 and 180."
        };
      }
      return {
        latitude: firstText,
        longitude: secondText,
        value: "",
        error: ""
      };
    }

    if (single) {
      const value = signedCoordText(single[1], single[2]);
      const number = Number(value);
      if (!isFinite(number)) {
        return {
          latitude: "",
          longitude: "",
          value: "",
          error: "Not a valid coordinate."
        };
      }
      if (as === "latitude" && Math.abs(number) > 90) {
        return {
          latitude: "",
          longitude: "",
          value: "",
          error: "Latitude must be between -90 and 90."
        };
      }
      if (as === "longitude" && Math.abs(number) > 180) {
        return {
          latitude: "",
          longitude: "",
          value: "",
          error: "Longitude must be between -180 and 180."
        };
      }
      return {
        latitude: "",
        longitude: "",
        value: value,
        error: ""
      };
    }

    return {
      latitude: "",
      longitude: "",
      value: "",
      error: "Paste a pair like 32.744582, -97.816176"
    };
  }

  /**
   * Normalize a pasted Google / Apple / OSM / Waze / Bing map URL and
   * pull lat/long out of the link when the pin is in the URL.
   */
  function parseMapLink(raw) {
    const text = String(raw || "").trim();
    const empty = { url: "", latitude: "", longitude: "", error: "" };
    if (!text) {
      return empty;
    }

    const found = text.match(/https?:\/\/[^\s<>"']+/i);
    let candidate = found ? found[0] : text;
    candidate = candidate.replace(/[.,);]+$/, "");

    if (!/^https?:\/\//i.test(candidate)) {
      if (/^(www\.|maps\.|goo\.gl\/|maps\.app\.goo\.gl\/)/i.test(candidate)) {
        candidate = "https://" + candidate;
      } else {
        return {
          url: "",
          latitude: "",
          longitude: "",
          error: "Paste a map link (Google, Apple, OSM, or Waze)."
        };
      }
    }

    let parsed;
    try {
      parsed = new URL(candidate);
    } catch (e) {
      return {
        url: "",
        latitude: "",
        longitude: "",
        error: "Not a valid map link."
      };
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return {
        url: "",
        latitude: "",
        longitude: "",
        error: "Map link must be http(s)."
      };
    }

    const href = parsed.href;
    const params = parsed.searchParams;
    let coords = null;

    const bang = href.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (bang) {
      coords = pairLooksLikeCoords(bang[1], bang[2]);
    }

    if (!coords) {
      const at = href.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (at) {
        coords = pairLooksLikeCoords(at[1], at[2]);
      }
    }

    if (!coords) {
      const osmHash = parsed.hash.match(
        /#map=\d+\/(-?\d+\.\d+)\/(-?\d+\.\d+)/
      );
      if (osmHash) {
        coords = pairLooksLikeCoords(osmHash[1], osmHash[2]);
      }
    }

    function paramPair(latKey, lngKey) {
      if (coords) {
        return;
      }
      const lat = params.get(latKey);
      const lng = params.get(lngKey);
      if (lat && lng) {
        coords = pairLooksLikeCoords(lat, lng);
      }
    }
    paramPair("mlat", "mlon");
    paramPair("mlat", "mlng");

    if (!coords) {
      const ll = params.get("ll") || params.get("sll") || params.get("center");
      if (ll) {
        const parts = String(ll).split(",");
        if (parts.length >= 2) {
          coords = pairLooksLikeCoords(parts[0], parts[1]);
        }
      }
    }

    if (!coords) {
      const cp = params.get("cp");
      if (cp && cp.indexOf("~") !== -1) {
        const parts = cp.split("~");
        coords = pairLooksLikeCoords(parts[0], parts[1]);
      }
    }

    if (!coords) {
      const q =
        params.get("q") ||
        params.get("query") ||
        params.get("daddr") ||
        params.get("destination");
      if (q) {
        const m = String(q).match(
          /^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/
        );
        if (m) {
          coords = pairLooksLikeCoords(m[1], m[2]);
        }
      }
    }

    return {
      url: href,
      latitude: coords ? coords.latitude : "",
      longitude: coords ? coords.longitude : "",
      error: ""
    };
  }

  function openAddressInGoogleMaps(address) {
    const query = formatAddressQuery(address);
    if (!query) return "";
    const url = googleMapsSearchUrl(query);
    if (typeof window !== "undefined" && window.open) {
      window.open(url, "_blank", "noopener");
    }
    return url;
  }

  // ===== DOM helpers (cached) =====
  const elCache = {};
  function getEl(id) {
    if (!elCache[id]) {
      elCache[id] = document.getElementById(id);
    }
    return elCache[id];
  }

  function readAddressFields() {
    return {
      street: (getEl("street") && getEl("street").value) || "",
      street2: (getEl("street2") && getEl("street2").value) || "",
      city: (getEl("city") && getEl("city").value) || "",
      state: (getEl("state") && getEl("state").value) || "",
      zip: (getEl("zip") && getEl("zip").value) || "",
      latitude: (getEl("latitude") && getEl("latitude").value) || "",
      longitude: (getEl("longitude") && getEl("longitude").value) || ""
    };
  }

  function writeAddressFields(components, options) {
    options = options || {};
    const clearEmpty = !!options.clearEmpty;
    const ids = [
      "street",
      "street2",
      "city",
      "state",
      "zip",
      "latitude",
      "longitude"
    ];
    ids.forEach((id) => {
      const el = getEl(id);
      if (!el) return;
      const val = components[id];
      if (val !== undefined && val !== null && val !== "") {
        el.value = val;
      } else if (clearEmpty) {
        el.value = "";
      }
    });
  }

  function setAddressFieldState(result) {
    const ids = ["street", "street2", "city", "state", "zip"];
    const invalid = {};
    (result.errors || []).forEach((error) => {
      invalid[error.field] = error.message;
    });

    ids.forEach((id) => {
      const el = getEl(id);
      if (!el) return;
      if (invalid[id]) {
        el.classList.add("is-invalid");
        el.setAttribute("title", invalid[id]);
      } else {
        el.classList.remove("is-invalid");
        el.removeAttribute("title");
      }
    });

    const status = getEl("addressStatus");
    if (!status) return;
    if (!(result.errors && result.errors.length)) {
      status.textContent = "";
      status.hidden = true;
      status.classList.remove("is-ok");
      return;
    }
    status.hidden = false;
    status.classList.remove("is-ok");
    status.textContent = result.errors
      .map((error) => error.message)
      .join(". ");
  }

  function setAddressStatus(message, isOk) {
    const status = getEl("addressStatus");
    if (!status) return;
    if (!message) {
      status.hidden = true;
      status.textContent = "";
      status.classList.remove("is-ok");
      return;
    }
    status.hidden = false;
    status.textContent = message;
    if (isOk) {
      status.classList.add("is-ok");
    } else {
      status.classList.remove("is-ok");
    }
  }

  function clearAddressFields() {
    writeAddressFields(emptyComponents(), { clearEmpty: true });
    setAddressFieldState({ errors: [], complete: false, valid: true });
    setAddressStatus("");
  }

  function applyAddressValidation() {
    const raw = readAddressFields();
    const result = validateAddress(raw);
    writeAddressFields(result.normalized, { clearEmpty: false });
    setAddressFieldState(result);
    return result;
  }

  // ===== Geocode =====

  function getCachedGeo(query) {
    try {
      return global.COPDoc.repositories.viewState.getGeocode(query);
    } catch (e) {
      return null;
    }
  }

  function setCachedGeo(query, geo) {
    try {
      global.COPDoc.repositories.viewState.putGeocode(query, geo);
    } catch (e) {
      /* ignore quota / private mode */
    }
  }

  function geocodeWithCensus(address, signal) {
    const normalized = validateAddress(address).normalized;
    const params = new URLSearchParams({
      street: [normalized.street, normalized.street2]
        .filter(Boolean)
        .join(" "),
      city: normalized.city,
      state: normalized.state,
      zip: String(normalized.zip || "").replace(/-\d{4}$/, ""),
      benchmark: "Public_AR_Current",
      format: "json"
    });

    return fetch(
      "https://geocoding.geo.census.gov/geocoder/locations/address?" +
        params.toString(),
      signal ? { signal: signal } : undefined
    ).then((response) => {
      if (!response.ok) {
        throw new Error("Census geocoder HTTP " + response.status);
      }
      return response.json();
    }).then((data) => {
      const match =
        data &&
        data.result &&
        data.result.addressMatches &&
        data.result.addressMatches[0];
      if (!match || !match.coordinates) {
        throw new Error("No Census match");
      }
      return {
        latitude: formatCoordinate(match.coordinates.y),
        longitude: formatCoordinate(match.coordinates.x),
        matchedAddress: match.matchedAddress || "",
        source: "census"
      };
    });
  }

  function geocodeWithNominatim(address, signal) {
    const query = formatAddressQuery(address);
    const url =
      "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=" +
      encodeURIComponent(query);

    return fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "LeadFormAddressParser/1.2 (lead-entry form; https://example.com)"
      },
      signal: signal
    }).then((response) => {
      if (!response.ok) {
        throw new Error("Nominatim HTTP " + response.status);
      }
      return response.json();
    }).then((data) => {
      const match = data && data[0];
      if (!match) {
        throw new Error("No Nominatim match");
      }
      return {
        latitude: formatCoordinate(match.lat),
        longitude: formatCoordinate(match.lon),
        matchedAddress: match.display_name || "",
        source: "nominatim"
      };
    });
  }

  function geocodeAddress(address) {
    const query = formatAddressQuery(address);
    const cached = getCachedGeo(query);
    if (cached) {
      return Promise.resolve(cached);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    return geocodeWithCensus(address, controller.signal)
      .catch((error) => {
        if (controller.signal.aborted) {
          throw error;
        }
        return geocodeWithNominatim(address, controller.signal);
      })
      .then((geo) => {
        setCachedGeo(query, geo);
        return geo;
      })
      .finally(() => {
        clearTimeout(timeoutId);
      });
  }

  function mapAddress() {
    const result = applyAddressValidation();
    if (!result.complete) {
      setAddressStatus(
        result.errors.length
          ? result.errors.map((e) => e.message).join(". ")
          : "Enter a complete address before mapping."
      );
      return Promise.resolve(null);
    }

    openAddressInGoogleMaps(result.normalized);

    const button = getEl("mapAddressButton");
    if (button) button.disabled = true;
    setAddressStatus("Maps opened. Looking up coordinates…", true);

    return geocodeAddress(result.normalized)
      .then((geo) => {
        writeAddressFields(
          {
            latitude: geo.latitude,
            longitude: geo.longitude
          },
          { clearEmpty: false }
        );
        setAddressStatus(
          "Lat " + geo.latitude + ", Long " + geo.longitude + " (" + geo.source + ")",
          true
        );
        return geo;
      })
      .catch((err) => {
        setAddressStatus(
          "Maps opened. Could not fetch coordinates (" +
            (err && err.message ? err.message : "network") +
            "). Serve over http(s) if this keeps failing."
        );
        return null;
      })
      .finally(() => {
        if (button) button.disabled = false;
      });
  }

  // ===== Attach =====
  let attached = false;
  let listeners = [];

  function attachAddressValidation() {
    if (attached) {
      return getController();
    }
    attached = true;

    const street = getEl("street");
    const fieldIds = ["street", "street2", "city", "state", "zip"];

    if (street) {
      street.setAttribute(
        "title",
        "Paste a full address to auto-fill city, state, ZIP and unit"
      );

      const onPaste = function () {
        window.setTimeout(function () {
          const parsed = parseAddress(street.value);
          if (
            parsed.isComplete ||
            (parsed.components.city && parsed.components.state)
          ) {
            writeAddressFields(parsed.components, { clearEmpty: true });
            const result = validateAddress(parsed.components);
            setAddressFieldState(result);
            setAddressStatus("Address auto-filled ✓", true);
            // fade success after a moment
            window.setTimeout(function () {
              if (getEl("addressStatus") && getEl("addressStatus").textContent.indexOf("auto-filled") !== -1) {
                setAddressStatus(result.complete ? "" : null, false);
              }
            }, 2500);
          } else {
            applyAddressValidation();
          }
        }, 0);
      };
      street.addEventListener("paste", onPaste);
      listeners.push({ el: street, type: "paste", fn: onPaste });
    }

    fieldIds.forEach(function (id) {
      const el = getEl(id);
      if (!el) return;
      const onBlur = function () {
        applyAddressValidation();
      };
      const onInput = function () {
        liveFormatAddressField(el, id);
        const status = getEl("addressStatus");
        if (status && !status.classList.contains("is-ok")) {
          setAddressStatus("");
        }
      };
      el.addEventListener("blur", onBlur);
      el.addEventListener("input", onInput);
      listeners.push({ el: el, type: "blur", fn: onBlur });
      listeners.push({ el: el, type: "input", fn: onInput });
    });

    const mapButton = getEl("mapAddressButton");
    if (mapButton) {
      const onClick = function () {
        mapAddress();
      };
      mapButton.addEventListener("click", onClick);
      listeners.push({ el: mapButton, type: "click", fn: onClick });
    }

    return getController();
  }

  /**
   * Bind one repeatable address card. Cards prefix their ids
   * (address-0-1-street), so global getElementById("mapAddressButton")
   * never finds the live button — that is why Map it was dead.
   */
  function bindAddressCard(card) {
    if (!card || card.dataset.addressBound === "true") {
      return;
    }
    card.dataset.addressBound = "true";

    function field(name) {
      return card.querySelector('[data-field="' + name + '"]');
    }

    function read() {
      return {
        street: field("street") ? field("street").value : "",
        street2: field("street2") ? field("street2").value : "",
        city: field("city") ? field("city").value : "",
        state: field("state") ? field("state").value : "",
        zip: field("zip") ? field("zip").value : "",
        latitude: field("latitude") ? field("latitude").value : "",
        longitude: field("longitude") ? field("longitude").value : ""
      };
    }

    function write(components) {
      function set(name, value) {
        const el = field(name);
        if (!el || value === undefined) {
          return;
        }
        el.value = value == null ? "" : String(value);
      }
      set("street", components.street);
      set("street2", components.street2);
      set("city", components.city);
      set("state", components.state);
      set("zip", components.zip);
      set("latitude", components.latitude);
      set("longitude", components.longitude);
      if (components.latitude && components.longitude) {
        set(
          "latLong",
          formatLatLongPair(components.latitude, components.longitude)
        );
      } else if (components.latLong) {
        set("latLong", components.latLong);
      }
    }

    function setStatus(message, isOk) {
      const status = field("addressStatus");
      if (!status) {
        return;
      }
      if (!message) {
        status.hidden = true;
        status.textContent = "";
        status.classList.remove("is-ok");
        return;
      }
      status.hidden = false;
      status.textContent = message;
      if (isOk) {
        status.classList.add("is-ok");
      } else {
        status.classList.remove("is-ok");
      }
    }

    function apply() {
      const result = validateAddress(read());
      write(result.normalized);
      const ids = ["street", "street2", "city", "state", "zip"];
      const invalid = {};
      result.errors.forEach(function (error) {
        invalid[error.field] = error.message;
      });
      ids.forEach(function (name) {
        const el = field(name);
        if (!el) {
          return;
        }
        if (invalid[name]) {
          el.classList.add("is-invalid");
          el.setAttribute("title", invalid[name]);
        } else {
          el.classList.remove("is-invalid");
          el.removeAttribute("title");
        }
      });
      if (result.errors.length) {
        setStatus(
          result.errors
            .map(function (error) {
              return error.message;
            })
            .join(". ")
        );
      } else {
        setStatus("");
      }
      return result;
    }

    function completeAddressOrExplain() {
      const result = apply();
      if (result.complete) {
        return result;
      }
      setStatus(
        result.errors.length
          ? result.errors
              .map(function (error) {
                return error.message;
              })
              .join(". ")
          : "Enter a complete address first."
      );
      return null;
    }

    function lookupCoordinates(result, button, pendingMessage) {
      if (button) {
        button.disabled = true;
      }
      setStatus(pendingMessage, true);
      return geocodeAddress(result.normalized)
        .then(function (geo) {
          write({
            latitude: geo.latitude,
            longitude: geo.longitude
          });
          setStatus(
            "Lat " +
              geo.latitude +
              ", Long " +
              geo.longitude +
              " (" +
              geo.source +
              ")",
            true
          );
          return geo;
        })
        .catch(function (err) {
          setStatus(
            "Could not fetch coordinates (" +
              (err && err.message ? err.message : "network") +
              "). Serve over http(s) if this keeps failing."
          );
          return null;
        })
        .then(function (geo) {
          if (button) {
            button.disabled = false;
          }
          return geo;
        });
    }

    function showPin(geo) {
      if (
        !geo ||
        !global.COPDoc ||
        !COPDoc.locationMap ||
        typeof COPDoc.locationMap.show !== "function"
      ) {
        return;
      }
      COPDoc.locationMap.show(card, geo.latitude, geo.longitude);
    }

    function resolveAddress() {
      const result = completeAddressOrExplain();
      if (!result) {
        return;
      }
      lookupCoordinates(
        result,
        field("resolveAddressButton"),
        "Looking up coordinates…"
      ).then(showPin);
    }

    function mapThisCard() {
      const result = completeAddressOrExplain();
      if (!result) {
        return;
      }
      const url = googleMapsSearchUrl(formatAddressQuery(result.normalized));
      if (typeof window !== "undefined" && window.open) {
        window.open(url, "_blank", "noopener");
      }
    }

    const street = field("street");
    if (street) {
      street.setAttribute(
        "title",
        "Paste a full address to fill city, state, and ZIP"
      );
      street.addEventListener("paste", function () {
        window.setTimeout(function () {
          const parsed = parseAddress(street.value);
          if (
            parsed.isComplete ||
            (parsed.components.city && parsed.components.state)
          ) {
            write(parsed.components);
          }
          apply();
        }, 0);
      });
    }

    ["street", "street2", "city", "state", "zip"].forEach(function (name) {
      const el = field(name);
      if (!el) {
        return;
      }
      el.addEventListener("input", function () {
        liveFormatAddressField(el, name);
        const status = field("addressStatus");
        if (status && !status.classList.contains("is-ok")) {
          setStatus("");
        }
      });
      el.addEventListener("blur", function () {
        apply();
      });
    });

    function applyLatLongField(raw, opts) {
      opts = opts || {};
      const showStatus = opts.showStatus !== false;
      const pairEl = field("latLong");
      const result = validateLatLong(raw);

      function mark(message) {
        if (!pairEl) {
          return;
        }
        if (message) {
          pairEl.classList.add("is-invalid");
          pairEl.setAttribute("title", message);
          pairEl.setAttribute("aria-invalid", "true");
        } else {
          pairEl.classList.remove("is-invalid");
          pairEl.removeAttribute("title");
          pairEl.removeAttribute("aria-invalid");
        }
      }

      if (result.valid && result.complete) {
        write({
          latitude: result.latitude,
          longitude: result.longitude,
          latLong: result.formatted
        });
        mark("");
        if (showStatus) {
          setStatus(result.formatted, true);
        }
        return result;
      }

      if (!String(raw || "").trim()) {
        write({ latitude: "", longitude: "", latLong: "" });
        mark("");
        if (showStatus) {
          setStatus("");
        }
        return result;
      }

      if (showStatus) {
        mark(result.reason);
        setStatus(result.reason);
      }
      return result;
    }

    const latLongEl = field("latLong");
    if (latLongEl) {
      latLongEl.addEventListener("input", function () {
        clearFieldInvalid(latLongEl);
        const result = validateLatLong(latLongEl.value);
        if (result.valid && result.complete) {
          applyLatLongField(latLongEl.value, { showStatus: false });
        }
      });
      latLongEl.addEventListener("paste", function () {
        window.setTimeout(function () {
          applyLatLongField(latLongEl.value, { showStatus: true });
        }, 0);
      });
      latLongEl.addEventListener("blur", function () {
        applyLatLongField(latLongEl.value, { showStatus: true });
      });
    }

    const resolveButton = field("resolveAddressButton");
    if (resolveButton) {
      resolveButton.addEventListener("click", function () {
        resolveAddress();
      });
    }

    const mapButton = field("mapAddressButton");
    if (mapButton) {
      mapButton.addEventListener("click", function () {
        mapThisCard();
      });
    }

    if (global.COPDoc && COPDoc.locationMap && typeof COPDoc.locationMap.bind === "function") {
      COPDoc.locationMap.bind(card);
    }
  }

  function getController() {
    return {
      validate: applyAddressValidation,
      map: mapAddress,
      clear: clearAddressFields,
      parse: parseAddress,
      format: formatFullAddress,
      destroy: function () {
        listeners.forEach(function (l) {
          l.el.removeEventListener(l.type, l.fn);
        });
        listeners = [];
        attached = false;
      }
    };
  }

  // ===== Public surface =====
  const AddressUtils = {
    // pure
    parseAddress: parseAddress,
    validateAddress: validateAddress,
    formatFullAddress: formatFullAddress,
    formatAddressQuery: formatAddressQuery,
    parseMapLink: parseMapLink,
    parseLatLong: parseLatLong,
    validateLatLong: validateLatLong,
    formatLatLongPair: formatLatLongPair,
    googleMapsSearchUrl: googleMapsSearchUrl,
    formatCoordinate: formatCoordinate,
    normalizeState: normalizeState,
    normalizeZip: normalizeZip,
    formatStreetLine: formatStreetLine,
    formatCityName: formatCityName,
    normalizeUnit: normalizeUnit,
    getAddressType: getAddressType,
    isPOBox: isPOBox,
    isRuralRoute: isRuralRoute,
    isMilitary: isMilitary,
    emptyComponents: emptyComponents,
    // DOM / actions
    readAddressFields: readAddressFields,
    writeAddressFields: writeAddressFields,
    applyAddressValidation: applyAddressValidation,
    clearAddressFields: clearAddressFields,
    setAddressStatus: setAddressStatus,
    mapAddress: mapAddress,
    openAddressInGoogleMaps: openAddressInGoogleMaps,
    geocodeAddress: geocodeAddress,
    bindAddressCard: bindAddressCard,
    attachAddressValidation: attachAddressValidation,
    // constants if needed
    ADDRESS_STATE_NAMES: ADDRESS_STATE_NAMES,
    STREET_TYPE_DISPLAY: STREET_TYPE_DISPLAY
  };

  // Expose
  if (typeof module !== "undefined" && module.exports) {
    module.exports = AddressUtils;
  }
  global.AddressUtils = AddressUtils;

  // Backward-compatible globals (optional – keep for drop-in)
  global.parseAddress = parseAddress;
  global.validateAddress = validateAddress;
  global.applyAddressValidation = applyAddressValidation;
  global.mapAddress = mapAddress;
  global.bindAddressCard = bindAddressCard;
  global.parseMapLink = parseMapLink;
  global.parseLatLong = parseLatLong;
  global.validateLatLong = validateLatLong;
  global.formatLatLongPair = formatLatLongPair;
  global.googleMapsSearchUrl = googleMapsSearchUrl;
  global.formatCoordinate = formatCoordinate;
  global.attachAddressValidation = attachAddressValidation;
  global.formatFullAddress = formatFullAddress;
  global.clearAddressFields = clearAddressFields;
  global.normalizeState = normalizeState;
  global.normalizeZip = normalizeZip;

  // Auto-attach if DOM is ready and elements exist
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        if (document.getElementById("street")) {
          attachAddressValidation();
        }
      });
    } else if (document.getElementById("street")) {
      attachAddressValidation();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
