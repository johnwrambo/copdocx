/**
 * Oracle — read-only arrest / encounter analysis.
 * Does not write workspace, admin, or book-in stores.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var model = root.model || {};
  var OFFICE = "DAL-3";
  var TABLE_LIMIT = 80;
  var CELL_MIN = 3;
  var DALLAS = [32.78, -96.8];
  var COP_TYPES = {
    VEHICLE_STOP: true,
    CONSENSUAL_ENCOUNTER: true,
    KNOCK_AND_TALK: true,
    COLLATERAL_CONTACT: true
  };
  var DYNAMIC_TYPES = {
    TARGETED_ARREST: true,
    AT_LARGE: true
  };
  var FAMILY_LABEL = {
    cop: "Cop stop",
    dynamic: "Dynamic",
    other: "Other",
    all: "All stops"
  };
  var WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var EXPLAIN = {
    arrests:
      "Distinct booked arrest episodes in the selected arrest-date range. One person arrested twice is two. Draft cases are excluded.",
    encountersWithArrests:
      "Distinct encounter IDs on those same booked arrests. This is Y in “arrested X subjects in Y encounters.”",
    hit:
      "Hit rate: completed stops with at least one arrested subject, divided by completed stops. A stop either hit or it did not.",
    yield:
      "Yield: arrested subjects on completed stops, divided by completed stops. One stop can mint several arrests.",
    flee:
      "Flee rate: subjects who fled on completed stops, divided by completed stops.",
    targetYield:
      "Target yield: TARGET-role subjects arrested on those stops, divided by completed stops.",
    collateralYield:
      "Collateral yield: COLLATERAL-role subjects arrested on those stops, divided by completed stops.",
    empty:
      "Empty-handed rate: completed stops with zero arrested subjects, divided by completed stops.",
    share:
      "Share of arrested subjects on completed stops that came from cop stops versus dynamic stops.",
    teams:
      "Team comparison uses completed stops in the period. It is not filtered by the scope team dropdown. Default sort is yield (arrests per stop), not raw arrests. Arrests/active day is that team’s arrests divided by days they had a stop.",
    mean:
      "Mean is the average. Arrests per active day averages only days that had a completed stop. Yield per stop averages arrested subjects on each stop.",
    median:
      "Median is the middle value. Half the days (or stops) are at or below it. Use it when one fat day would pull the mean up.",
    sd:
      "Sample standard deviation of the same series. High SD means the week is jumpy, not a steady pace.",
    weekday:
      "Arrests and rates grouped by local weekday of the completed stop. Best day uses yield, not raw volume, and ignores weekdays with fewer than 3 stops when it can.",
    norm:
      "Raw = totals. Per stop = yield. Per weekday = totals divided by how many times that weekday occurred in the period (needed for FY). Index 100 = mean of cells with data. Z = standard deviations from that mean."
  };

  var mapState = null;

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function pad2(value) {
    var s = String(value);
    return s.length < 2 ? "0" + s : s;
  }

  function localDay(date) {
    return (
      date.getFullYear() +
      "-" +
      pad2(date.getMonth() + 1) +
      "-" +
      pad2(date.getDate())
    );
  }

  function startOfWeek(date) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() - d.getDay());
    return d;
  }

  function fyStart(date) {
    var year = date.getMonth() >= 9 ? date.getFullYear() : date.getFullYear() - 1;
    return new Date(year, 9, 1);
  }

  function addDays(date, days) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
  }

  function catalogLabel(list, value) {
    var key = text(value);
    if (!key) {
      return "";
    }
    var normalized = key.toLowerCase();
    var found = (list || []).filter(function (row) {
      return (
        row &&
        (text(row.code).toLowerCase() === normalized ||
          text(row.label).toLowerCase() === normalized)
      );
    })[0];
    return found ? text(found.label || found.code) : key;
  }

  function periodRange(kind, now, customFrom, customTo) {
    now = now || new Date();
    var today = localDay(now);
    if (kind === "week") {
      var week0 = startOfWeek(now);
      return { from: localDay(week0), to: today };
    }
    if (kind === "fy") {
      return { from: localDay(fyStart(now)), to: today };
    }
    if (kind === "custom") {
      var from = text(customFrom) || today;
      var to = text(customTo) || today;
      if (from > to) {
        return { from: to, to: from };
      }
      return { from: from, to: to };
    }
    return { from: today, to: today };
  }

  function inRange(day, from, to) {
    if (!day) {
      return false;
    }
    if (from && day < from) {
      return false;
    }
    if (to && day > to) {
      return false;
    }
    return true;
  }

  function teamOf(row) {
    return text((row && row.team) || "");
  }

  function dateKey(value) {
    var raw = text(value);
    if (raw.length >= 10) {
      return raw.slice(0, 10);
    }
    return "";
  }

  function familyOf(eventType) {
    var key = text(eventType).toUpperCase();
    if (COP_TYPES[key]) {
      return "cop";
    }
    if (DYNAMIC_TYPES[key]) {
      return "dynamic";
    }
    return "other";
  }

  function familyLabel(code) {
    return FAMILY_LABEL[code] || FAMILY_LABEL.other;
  }

  function roleLabel(code) {
    var key = text(code).toUpperCase();
    if (key === "TARGET") {
      return "Target";
    }
    if (key === "COLLATERAL") {
      return "Collateral";
    }
    if (key === "OTHER") {
      return "Other";
    }
    return key ? key : "Unknown";
  }

  function outcomeBucket(code) {
    var key = text(code).toUpperCase();
    if (key === "ARRESTED") {
      return "arrested";
    }
    if (key === "RELEASED") {
      return "released";
    }
    if (key.indexOf("FLED") === 0) {
      return "fled";
    }
    if (!key) {
      return "unknown";
    }
    return "other";
  }

  function personName(person) {
    var name = (person && person.name) || {};
    var given = [name.firstName, name.middleName].filter(Boolean).join(" ");
    return [name.lastName, given].filter(Boolean).join(", ") || "Unnamed subject";
  }

  function subjectForPerson(encounter, personId) {
    var id = text(personId);
    var subjects = (encounter && encounter.subjects) || [];
    var i;
    for (i = 0; i < subjects.length; i++) {
      if (subjects[i] && text(subjects[i].personId) === id) {
        return subjects[i];
      }
    }
    return null;
  }

  function countMapInc(map, key) {
    var id = key || "Unknown";
    map[id] = (map[id] || 0) + 1;
  }

  function mixRows(map) {
    var keys = Object.keys(map);
    keys.sort(function (a, b) {
      if (a === "Unknown" && b !== "Unknown") {
        return 1;
      }
      if (b === "Unknown" && a !== "Unknown") {
        return -1;
      }
      return map[b] - map[a] || a.localeCompare(b);
    });
    var total = 0;
    keys.forEach(function (key) {
      total += map[key];
    });
    return keys.map(function (key) {
      return {
        key: key,
        count: map[key],
        share: total ? map[key] / total : 0
      };
    });
  }

  function hasCoords(lat, lng) {
    var y = Number(lat);
    var x = Number(lng);
    return isFinite(y) && isFinite(x) && !(y === 0 && x === 0);
  }

  function gridKey(lat, lng) {
    if (!hasCoords(lat, lng)) {
      return "";
    }
    return Number(lat).toFixed(2) + "," + Number(lng).toFixed(2);
  }

  function gridBounds(key) {
    var parts = String(key || "").split(",");
    var lat = Number(parts[0]);
    var lng = Number(parts[1]);
    if (!hasCoords(lat, lng)) {
      return null;
    }
    return [
      [lat - 0.005, lng - 0.005],
      [lat + 0.005, lng + 0.005]
    ];
  }

  function emptyFamily() {
    return {
      stops: 0,
      hits: 0,
      arrests: 0,
      targetArrests: 0,
      collateralArrests: 0,
      fled: 0,
      empty: 0,
      mapped: 0
    };
  }

  function rate(num, den) {
    return den ? num / den : null;
  }

  function formatRate(num, den) {
    if (!den) {
      return "—";
    }
    return num + "/" + den + " (" + Math.round((num / den) * 100) + "%)";
  }

  function formatYield(num, den) {
    if (!den) {
      return "—";
    }
    return num + "/" + den + " (" + (num / den).toFixed(2) + ")";
  }

  function formatNum(value, digits) {
    if (value == null || !isFinite(value)) {
      return "—";
    }
    return Number(value).toFixed(digits == null ? 2 : digits);
  }

  function mean(values) {
    if (!values.length) {
      return null;
    }
    var sum = 0;
    values.forEach(function (value) {
      sum += value;
    });
    return sum / values.length;
  }

  function median(values) {
    if (!values.length) {
      return null;
    }
    var sorted = values.slice().sort(function (a, b) {
      return a - b;
    });
    var mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2) {
      return sorted[mid];
    }
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function stdev(values) {
    if (values.length < 2) {
      return null;
    }
    var avg = mean(values);
    var ss = 0;
    values.forEach(function (value) {
      ss += (value - avg) * (value - avg);
    });
    return Math.sqrt(ss / (values.length - 1));
  }

  function describe(values) {
    var nums = (values || []).filter(function (value) {
      return typeof value === "number" && isFinite(value);
    });
    return {
      n: nums.length,
      mean: mean(nums),
      median: median(nums),
      sd: stdev(nums),
      min: nums.length ? Math.min.apply(null, nums) : null,
      max: nums.length ? Math.max.apply(null, nums) : null
    };
  }

  function weekdayOf(day) {
    var parts = String(day || "").split("-");
    if (parts.length < 3) {
      return null;
    }
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (isNaN(date.getTime())) {
      return null;
    }
    return date.getDay();
  }

  function eachDay(from, to) {
    var out = [];
    var cur = text(from);
    var end = text(to);
    if (!cur || !end) {
      return out;
    }
    var guard = 0;
    while (cur <= end && guard < 800) {
      out.push(cur);
      var parts = cur.split("-");
      cur = localDay(
        new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]) + 1)
      );
      guard += 1;
    }
    return out;
  }

  function weekdayCountsInRange(from, to) {
    var counts = [0, 0, 0, 0, 0, 0, 0];
    eachDay(from, to).forEach(function (day) {
      var weekday = weekdayOf(day);
      if (weekday != null) {
        counts[weekday] += 1;
      }
    });
    return counts;
  }

  function addStopToFamily(bucket, stop) {
    bucket.stops += 1;
    bucket.arrests += stop.arrested;
    bucket.targetArrests += stop.targetArrests;
    bucket.collateralArrests += stop.collateralArrests;
    bucket.fled += stop.fled;
    if (stop.hit) {
      bucket.hits += 1;
    } else {
      bucket.empty += 1;
    }
    if (stop.mapped) {
      bucket.mapped += 1;
    }
  }

  function familyRates(bucket) {
    var stops = bucket.stops;
    return {
      stops: stops,
      hits: bucket.hits,
      arrests: bucket.arrests,
      fled: bucket.fled,
      empty: bucket.empty,
      mapped: bucket.mapped,
      hit: rate(bucket.hits, stops),
      yield: rate(bucket.arrests, stops),
      flee: rate(bucket.fled, stops),
      targetYield: rate(bucket.targetArrests, stops),
      collateralYield: rate(bucket.collateralArrests, stops),
      emptyRate: rate(bucket.empty, stops),
      hitLabel: formatRate(bucket.hits, stops),
      yieldLabel: formatYield(bucket.arrests, stops),
      fleeLabel: formatYield(bucket.fled, stops),
      targetYieldLabel: formatYield(bucket.targetArrests, stops),
      collateralYieldLabel: formatYield(bucket.collateralArrests, stops),
      emptyLabel: formatRate(bucket.empty, stops)
    };
  }

  function centerPlace(snap, record) {
    var locations = (snap && snap.locations) || (record && record.locations) || [];
    var center = null;
    locations.forEach(function (loc) {
      if (loc && loc.isCenter) {
        center = loc;
      }
    });
    if (!center) {
      center = locations[0] || {};
    }
    var pin = (snap && snap.pin) || {};
    return {
      city: text(center.city),
      zip: text(center.zip),
      lat: pin.latitude || center.latitude || "",
      lng: pin.longitude || center.longitude || ""
    };
  }

  function stopFromEncounter(row, catalogs) {
    var snap = row.completed || {};
    var place = centerPlace(snap, row);
    var subjects = snap.subjects || row.subjects || [];
    var arrested = 0;
    var released = 0;
    var fled = 0;
    var targetArrests = 0;
    var collateralArrests = 0;
    subjects.forEach(function (subject) {
      var bucket = outcomeBucket(subject && subject.outcome);
      var role = text(subject && subject.encounterRole).toUpperCase();
      if (bucket === "arrested") {
        arrested += 1;
        if (role === "TARGET") {
          targetArrests += 1;
        } else if (role === "COLLATERAL") {
          collateralArrests += 1;
        }
      } else if (bucket === "released") {
        released += 1;
      } else if (bucket === "fled") {
        fled += 1;
      }
    });
    var eventType = text(snap.eventType || row.eventType);
    var mapped = hasCoords(place.lat, place.lng);
    var hit = arrested > 0;
    var outcome = "empty";
    if (hit) {
      outcome = "hit";
    } else if (fled > 0) {
      outcome = "flee";
    }
    return {
      encounterId: text(row.encounterId),
      startedAt: dateKey(snap.startedAt || row.startedAt),
      team: text(snap.team || row.team),
      eventType: eventType,
      eventTypeLabel:
        catalogLabel(catalogs.encounterTypes, eventType) || eventType || "Unknown",
      family: familyOf(eventType),
      city: place.city || "Unknown",
      zip: place.zip,
      lat: mapped ? Number(place.lat) : null,
      lng: mapped ? Number(place.lng) : null,
      mapped: mapped,
      arrested: arrested,
      released: released,
      fled: fled,
      targetArrests: targetArrests,
      collateralArrests: collateralArrests,
      hit: hit,
      empty: !hit,
      outcome: outcome
    };
  }

  function collectArrestRows(leads, encounterById, catalogs) {
    catalogs = catalogs || {};
    var rows = [];
    (leads || []).forEach(function (lead) {
      if (!lead || (model.isCommitted && !model.isCommitted(lead))) {
        return;
      }
      var person = model.subjectOf ? model.subjectOf(lead) : lead.person;
      if (!person) {
        return;
      }
      var immigration = person.immigration || {};
      (person.arrests || []).forEach(function (arrest) {
        if (!arrest) {
          return;
        }
        var encounterId = text(arrest.encounterId || arrest.encounterNumber);
        var encounter = encounterId ? encounterById[encounterId] : null;
        var subject = encounter ? subjectForPerson(encounter, person.personId) : null;
        var role = text(
          (subject && subject.encounterRole) || arrest.subjectRole
        ).toUpperCase();
        var eventType = text(
          (encounter &&
            encounter.completed &&
            encounter.completed.eventType) ||
            (encounter && encounter.eventType)
        );
        var pin = encounter && encounter.completed && encounter.completed.pin;
        rows.push({
          leadId: text(lead.leadId),
          personId: text(person.personId),
          arrestId: text(arrest.arrestId),
          name: personName(person),
          date: dateKey(arrest.arrestDate || arrest.arrestDateTime),
          team: text(arrest.team || (encounter && encounter.team)),
          encounterId: encounterId,
          encounterNumber: text(arrest.encounterNumber || encounterId),
          role: role,
          roleLabel: roleLabel(role),
          family: familyOf(eventType),
          familyLabel: familyLabel(familyOf(eventType)),
          citizenship: text(person.citizenship),
          countryLabel:
            catalogLabel(catalogs.countries, person.citizenship) ||
            text(person.citizenship) ||
            "Unknown",
          disposition: text(immigration.disposition),
          dispositionLabel:
            catalogLabel(catalogs.dispositions, immigration.disposition) ||
            text(immigration.disposition) ||
            "Unknown",
          eventType: eventType,
          eventTypeLabel:
            catalogLabel(catalogs.encounterTypes, eventType) ||
            eventType ||
            "Unknown",
          mapped: !!(pin && hasCoords(pin.latitude, pin.longitude))
        });
      });
    });
    return rows;
  }

  function aggregatePlaces(stops) {
    var byCity = {};
    (stops || []).forEach(function (stop) {
      if (!stop.mapped) {
        return;
      }
      var key = stop.city || "Unknown";
      if (!byCity[key]) {
        byCity[key] = emptyFamily();
        byCity[key].city = key;
        byCity[key].cop = 0;
        byCity[key].dynamic = 0;
        byCity[key].lat = stop.lat;
        byCity[key].lng = stop.lng;
      }
      addStopToFamily(byCity[key], stop);
      if (stop.family === "cop") {
        byCity[key].cop += 1;
      }
      if (stop.family === "dynamic") {
        byCity[key].dynamic += 1;
      }
    });
    return Object.keys(byCity)
      .map(function (key) {
        var row = byCity[key];
        var rates = familyRates(row);
        rates.city = row.city;
        rates.cop = row.cop;
        rates.dynamic = row.dynamic;
        rates.lat = row.lat;
        rates.lng = row.lng;
        return rates;
      })
      .sort(function (a, b) {
        return b.stops - a.stops || a.city.localeCompare(b.city);
      });
  }

  function aggregateCells(stops) {
    var byCell = {};
    (stops || []).forEach(function (stop) {
      if (!stop.mapped) {
        return;
      }
      var key = gridKey(stop.lat, stop.lng);
      if (!key) {
        return;
      }
      if (!byCell[key]) {
        byCell[key] = emptyFamily();
        byCell[key].key = key;
        byCell[key].cop = emptyFamily();
        byCell[key].dynamic = emptyFamily();
        byCell[key].lat = Number(key.split(",")[0]);
        byCell[key].lng = Number(key.split(",")[1]);
      }
      addStopToFamily(byCell[key], stop);
      if (stop.family === "cop") {
        addStopToFamily(byCell[key].cop, stop);
      }
      if (stop.family === "dynamic") {
        addStopToFamily(byCell[key].dynamic, stop);
      }
    });
    return Object.keys(byCell).map(function (key) {
      var row = byCell[key];
      var rates = familyRates(row);
      rates.key = row.key;
      rates.lat = row.lat;
      rates.lng = row.lng;
      rates.bounds = gridBounds(row.key);
      rates.cop = familyRates(row.cop);
      rates.dynamic = familyRates(row.dynamic);
      return rates;
    });
  }

  function aggregateDays(stops) {
    var byDay = {};
    (stops || []).forEach(function (stop) {
      var day = stop.startedAt;
      if (!day) {
        return;
      }
      if (!byDay[day]) {
        byDay[day] = emptyFamily();
        byDay[day].day = day;
      }
      addStopToFamily(byDay[day], stop);
    });
    return Object.keys(byDay)
      .sort()
      .map(function (day) {
        var rates = familyRates(byDay[day]);
        rates.day = day;
        rates.weekday = weekdayOf(day);
        rates.label = WEEKDAYS[rates.weekday] || "";
        return rates;
      });
  }

  function aggregateWeekdays(stops) {
    var days = WEEKDAYS.map(function (label, index) {
      var bucket = emptyFamily();
      bucket.weekday = index;
      bucket.label = label;
      bucket.cop = emptyFamily();
      bucket.dynamic = emptyFamily();
      return bucket;
    });
    (stops || []).forEach(function (stop) {
      var weekday = weekdayOf(stop.startedAt);
      if (weekday == null) {
        return;
      }
      addStopToFamily(days[weekday], stop);
      if (stop.family === "cop") {
        addStopToFamily(days[weekday].cop, stop);
      }
      if (stop.family === "dynamic") {
        addStopToFamily(days[weekday].dynamic, stop);
      }
    });
    return days.map(function (row) {
      var rates = familyRates(row);
      rates.weekday = row.weekday;
      rates.label = row.label;
      rates.cop = familyRates(row.cop);
      rates.dynamic = familyRates(row.dynamic);
      return rates;
    });
  }

  function aggregatePlaceWeekdays(stops) {
    var byCity = {};
    (stops || []).forEach(function (stop) {
      if (!stop.mapped) {
        return;
      }
      var city = stop.city || "Unknown";
      if (!byCity[city]) {
        byCity[city] = {
          city: city,
          lat: stop.lat,
          lng: stop.lng,
          days: WEEKDAYS.map(function () {
            return emptyFamily();
          })
        };
      }
      var weekday = weekdayOf(stop.startedAt);
      if (weekday == null) {
        return;
      }
      addStopToFamily(byCity[city].days[weekday], stop);
    });
    return Object.keys(byCity)
      .map(function (city) {
        var row = byCity[city];
        var days = row.days.map(function (bucket) {
          return familyRates(bucket);
        });
        var stops = 0;
        var arrests = 0;
        days.forEach(function (day) {
          stops += day.stops;
          arrests += day.arrests;
        });
        return {
          city: row.city,
          lat: row.lat,
          lng: row.lng,
          stops: stops,
          arrests: arrests,
          days: days
        };
      })
      .sort(function (a, b) {
        return b.stops - a.stops || a.city.localeCompare(b.city);
      });
  }

  function teamKey(stop) {
    return text(stop && stop.team) || "unassigned";
  }

  function teamLabel(key) {
    return key === "unassigned" ? "Unassigned" : "Team " + key;
  }

  function aggregateTeams(stops) {
    var byTeam = {};
    (stops || []).forEach(function (stop) {
      var key = teamKey(stop);
      if (!byTeam[key]) {
        byTeam[key] = emptyFamily();
        byTeam[key].team = key;
        byTeam[key].cop = emptyFamily();
        byTeam[key].dynamic = emptyFamily();
        byTeam[key].days = {};
      }
      addStopToFamily(byTeam[key], stop);
      if (stop.family === "cop") {
        addStopToFamily(byTeam[key].cop, stop);
      }
      if (stop.family === "dynamic") {
        addStopToFamily(byTeam[key].dynamic, stop);
      }
      if (stop.startedAt) {
        byTeam[key].days[stop.startedAt] = true;
      }
    });
    return Object.keys(byTeam)
      .map(function (key) {
        var row = byTeam[key];
        var rates = familyRates(row);
        var activeDays = Object.keys(row.days).length;
        rates.team = row.team;
        rates.label = teamLabel(row.team);
        rates.cop = familyRates(row.cop);
        rates.dynamic = familyRates(row.dynamic);
        rates.activeDays = activeDays;
        rates.perActiveDay = activeDays ? row.arrests / activeDays : null;
        return rates;
      })
      .sort(function (a, b) {
        if (a.team === "unassigned") {
          return 1;
        }
        if (b.team === "unassigned") {
          return -1;
        }
        return String(a.team).localeCompare(String(b.team), undefined, {
          numeric: true
        });
      });
  }

  function buildSpread(stops, from, to) {
    var daily = aggregateDays(stops);
    var byDay = {};
    daily.forEach(function (row) {
      byDay[row.day] = row;
    });
    var calendarArrests = eachDay(from, to).map(function (day) {
      return byDay[day] ? byDay[day].arrests : 0;
    });
    var yieldPerStop = (stops || []).map(function (stop) {
      return stop.arrested || 0;
    });
    return {
      activeDays: daily.length,
      calendarDays: calendarArrests.length,
      arrestsPerActiveDay: describe(
        daily.map(function (row) {
          return row.arrests;
        })
      ),
      arrestsPerCalendarDay: describe(calendarArrests),
      stopsPerActiveDay: describe(
        daily.map(function (row) {
          return row.stops;
        })
      ),
      yieldPerStop: describe(yieldPerStop),
      yieldPerActiveDay: describe(
        daily.map(function (row) {
          return row.yield == null ? 0 : row.yield;
        })
      ),
      days: daily
    };
  }

  function cellMetric(row, mode, occurrences) {
    occurrences = occurrences || 1;
    if (mode === "perStop") {
      return row.yield;
    }
    if (mode === "perWeekday") {
      return occurrences ? row.arrests / occurrences : null;
    }
    return row.arrests;
  }

  function summarize(input) {
    input = input || {};
    var from = text(input.from);
    var to = text(input.to);
    var team = text(input.team);
    var today = input.today ? new Date(input.today) : new Date();
    var catalogs = input.catalogs || {};
    var encounterById = {};
    (input.encounters || []).forEach(function (row) {
      if (row && row.encounterId) {
        encounterById[row.encounterId] = row;
      }
    });
    var arrestRows = collectArrestRows(input.leads, encounterById, catalogs);
    var allStops = [];
    (input.encounters || []).forEach(function (row) {
      if (!row || !row.meta || !row.meta.markedComplete || !row.completed) {
        return;
      }
      var stop = stopFromEncounter(row, catalogs);
      if (!inRange(stop.startedAt, from, to)) {
        return;
      }
      allStops.push(stop);
    });
    var stops = team
      ? allStops.filter(function (stop) {
          return teamOf(stop) === team;
        })
      : allStops;
    var missingDate = 0;
    var arrests = arrestRows.filter(function (row) {
      if (team && teamOf(row) !== team) {
        return false;
      }
      if (!row.date) {
        missingDate += 1;
        return false;
      }
      return inRange(row.date, from, to);
    });
    var encounterIds = {};
    var target = 0;
    var collateral = 0;
    var roleBlank = 0;
    var noEncounter = 0;
    var dispositionUnknown = 0;
    var unmappedArrests = 0;
    var dispositionMix = {};
    var eventMix = {};
    var countryMix = {};
    var roleMix = {};
    arrests.forEach(function (row) {
      if (row.encounterId) {
        encounterIds[row.encounterId] = true;
      } else {
        noEncounter += 1;
      }
      if (row.role === "TARGET") {
        target += 1;
      } else if (row.role === "COLLATERAL") {
        collateral += 1;
      } else {
        roleBlank += 1;
      }
      if (!row.disposition) {
        dispositionUnknown += 1;
      }
      if (row.encounterId && !row.mapped) {
        unmappedArrests += 1;
      }
      countMapInc(dispositionMix, row.dispositionLabel);
      countMapInc(eventMix, row.eventTypeLabel);
      countMapInc(countryMix, row.countryLabel);
      countMapInc(roleMix, row.roleLabel);
    });
    var released = 0;
    var fled = 0;
    var outcomeUnknown = 0;
    var unmappedStops = 0;
    var families = {
      cop: emptyFamily(),
      dynamic: emptyFamily(),
      other: emptyFamily(),
      all: emptyFamily()
    };
    stops.forEach(function (stop) {
      addStopToFamily(families.all, stop);
      addStopToFamily(families[stop.family] || families.other, stop);
      released += stop.released;
      fled += stop.fled;
      if (!stop.mapped) {
        unmappedStops += 1;
      }
    });
    (input.encounters || []).forEach(function (row) {
      if (!row || !row.meta || !row.meta.markedComplete || !row.completed) {
        return;
      }
      if (team && teamOf(row.completed) !== team && teamOf(row) !== team) {
        return;
      }
      if (!inRange(dateKey(row.completed.startedAt || row.startedAt), from, to)) {
        return;
      }
      (row.completed.subjects || row.subjects || []).forEach(function (subject) {
        if (outcomeBucket(subject && subject.outcome) === "unknown") {
          outcomeUnknown += 1;
        }
      });
    });
    var spark = [];
    var sparkStart = addDays(today, -13);
    var i;
    for (i = 0; i < 14; i++) {
      var day = localDay(addDays(sparkStart, i));
      var count = 0;
      arrestRows.forEach(function (row) {
        if (team && teamOf(row) !== team) {
          return;
        }
        if (row.date === day) {
          count += 1;
        }
      });
      spark.push({ day: day, count: count });
    }
    var teams = {};
    arrestRows.forEach(function (row) {
      if (row.team) {
        teams[row.team] = true;
      }
    });
    allStops.forEach(function (row) {
      if (row.team) {
        teams[row.team] = true;
      }
    });
    var teamRows = aggregateTeams(allStops);
    var allArrests = families.all.arrests;
    return {
      office: input.office || OFFICE,
      from: from,
      to: to,
      team: team,
      arrests: arrests.length,
      encountersWithArrests: Object.keys(encounterIds).length,
      completedEncounters: stops.length,
      target: target,
      collateral: collateral,
      released: released,
      fled: fled,
      unknown:
        missingDate + noEncounter + roleBlank + outcomeUnknown + unmappedStops,
      families: {
        cop: familyRates(families.cop),
        dynamic: familyRates(families.dynamic),
        other: familyRates(families.other),
        all: familyRates(families.all)
      },
      shares: {
        cop: allArrests ? families.cop.arrests / allArrests : null,
        dynamic: allArrests ? families.dynamic.arrests / allArrests : null,
        copArrests: families.cop.arrests,
        dynamicArrests: families.dynamic.arrests,
        allArrests: allArrests
      },
      stops: stops,
      places: aggregatePlaces(stops),
      cells: aggregateCells(stops),
      weekdays: aggregateWeekdays(stops),
      placeWeekdays: aggregatePlaceWeekdays(stops),
      weekdayOccurrences: weekdayCountsInRange(from, to),
      spread: buildSpread(stops, from, to),
      teamRows: teamRows,
      unlocated: stops.filter(function (stop) {
        return !stop.mapped;
      }),
      quality: {
        missingDate: missingDate,
        noEncounter: noEncounter,
        roleBlank: roleBlank,
        dispositionUnknown: dispositionUnknown,
        outcomeUnknown: outcomeUnknown,
        unmapped: unmappedStops,
        unmappedArrests: unmappedArrests
      },
      mix: {
        disposition: mixRows(dispositionMix),
        eventType: mixRows(eventMix),
        country: mixRows(countryMix),
        role: mixRows(roleMix)
      },
      spark: spark,
      teams: Object.keys(teams).sort(),
      rows: arrests.slice().sort(function (a, b) {
        return String(b.date).localeCompare(String(a.date)) ||
          String(a.name).localeCompare(String(b.name));
      })
    };
  }

  function sentence(summary) {
    var who = summary.team ? "Team " + summary.team : summary.office;
    if (!summary.arrests) {
      return who + " arrested 0 subjects in this period.";
    }
    return (
      who +
      " arrested " +
      summary.arrests +
      " subject" +
      (summary.arrests === 1 ? "" : "s") +
      " in " +
      summary.encountersWithArrests +
      " encounter" +
      (summary.encountersWithArrests === 1 ? "" : "s") +
      "."
    );
  }

  function rangeLabel(summary) {
    if (!summary.from) {
      return "";
    }
    if (summary.from === summary.to) {
      return summary.from;
    }
    return summary.from + " → " + summary.to;
  }

  function setText(id, value) {
    var el = byId(id);
    if (el) {
      el.textContent = value;
    }
  }

  function chipValue(attr, fallback) {
    var el = document.querySelector("[" + attr + "][aria-pressed='true']");
    return (el && el.getAttribute(attr)) || fallback;
  }

  function paintMix(id, rows) {
    var host = byId(id);
    if (!host) {
      return;
    }
    host.replaceChildren();
    if (!rows.length) {
      var empty = document.createElement("p");
      empty.className = "section-note";
      empty.textContent = "No values in this period.";
      host.appendChild(empty);
      return;
    }
    rows.forEach(function (row) {
      var line = document.createElement("div");
      line.className = "oracle-mix-row";
      var label = document.createElement("span");
      label.className = "oracle-mix-label";
      label.textContent = row.key;
      var track = document.createElement("span");
      track.className = "oracle-mix-track";
      var fill = document.createElement("span");
      fill.className = "oracle-mix-fill";
      fill.style.width = Math.round(row.share * 100) + "%";
      track.appendChild(fill);
      var n = document.createElement("span");
      n.className = "oracle-mix-n";
      n.textContent = String(row.count);
      line.appendChild(label);
      line.appendChild(track);
      line.appendChild(n);
      host.appendChild(line);
    });
  }

  function paintSpark(spark) {
    var host = byId("oracleSpark");
    if (!host) {
      return;
    }
    host.replaceChildren();
    var max = 0;
    spark.forEach(function (row) {
      if (row.count > max) {
        max = row.count;
      }
    });
    spark.forEach(function (row) {
      var col = document.createElement("div");
      col.className = "oracle-spark-col";
      var bar = document.createElement("span");
      bar.className = "oracle-spark-bar";
      var height = max ? Math.max(8, Math.round((row.count / max) * 64)) : 4;
      if (!row.count) {
        height = 4;
        bar.classList.add("is-empty");
      }
      bar.style.height = height + "px";
      bar.title = row.day + ": " + row.count;
      var cap = document.createElement("span");
      cap.className = "oracle-spark-cap";
      cap.textContent = row.day.slice(8);
      col.appendChild(bar);
      col.appendChild(cap);
      host.appendChild(col);
    });
  }

  function qualityLines(quality) {
    var lines = [];
    if (quality.missingDate) {
      lines.push(quality.missingDate + " arrest(s) missing a date (not in X).");
    }
    if (quality.noEncounter) {
      lines.push(quality.noEncounter + " arrest(s) with no encounter ID.");
    }
    if (quality.roleBlank) {
      lines.push(quality.roleBlank + " arrest(s) with no target/collateral role.");
    }
    if (quality.dispositionUnknown) {
      lines.push(quality.dispositionUnknown + " arrest(s) with no disposition.");
    }
    if (quality.outcomeUnknown) {
      lines.push(
        quality.outcomeUnknown + " completed-encounter subject(s) with no outcome."
      );
    }
    if (quality.unmapped) {
      lines.push(quality.unmapped + " completed stop(s) with no map pin.");
    }
    return lines;
  }

  function paintQuality(summary) {
    var list = byId("oracleQuality");
    var note = byId("oracleQualityNote");
    var lines = qualityLines(summary.quality);
    if (!list || !note) {
      return;
    }
    list.replaceChildren();
    if (!lines.length) {
      list.hidden = true;
      note.hidden = false;
      note.textContent = "No quality flags in this period.";
      return;
    }
    note.hidden = true;
    list.hidden = false;
    lines.forEach(function (line) {
      var li = document.createElement("li");
      li.textContent = line;
      list.appendChild(li);
    });
  }

  function paintTable(rows) {
    var empty = byId("oracleTableEmpty");
    var wrap = byId("oracleTableWrap");
    var body = byId("oracleTableBody");
    var note = byId("oracleTableNote");
    if (!empty || !wrap || !body) {
      return;
    }
    body.replaceChildren();
    if (!rows.length) {
      empty.hidden = false;
      wrap.hidden = true;
      if (note) {
        note.textContent = "One row per booked arrest in this period.";
      }
      return;
    }
    empty.hidden = true;
    wrap.hidden = false;
    var shown = rows.slice(0, TABLE_LIMIT);
    shown.forEach(function (row) {
      var tr = document.createElement("tr");
      function td(value) {
        var cell = document.createElement("td");
        cell.textContent = value || "—";
        tr.appendChild(cell);
      }
      td(row.date);
      td(row.name);
      td(row.familyLabel);
      td(row.roleLabel);
      td(row.dispositionLabel);
      td(row.countryLabel);
      td(row.encounterNumber || "—");
      td(row.team || "—");
      var actions = document.createElement("td");
      if (row.leadId) {
        var caseLink = document.createElement("a");
        caseLink.href = "case.html?id=" + encodeURIComponent(row.leadId);
        caseLink.textContent = "Case";
        actions.appendChild(caseLink);
      }
      if (row.encounterId) {
        if (actions.childNodes.length) {
          actions.appendChild(document.createTextNode(" · "));
        }
        var encLink = document.createElement("a");
        encLink.href =
          "encounter-form.html?id=" + encodeURIComponent(row.encounterId);
        encLink.textContent = "Encounter";
        actions.appendChild(encLink);
      }
      tr.appendChild(actions);
      body.appendChild(tr);
    });
    if (note) {
      note.textContent =
        rows.length > TABLE_LIMIT
          ? "Showing " + TABLE_LIMIT + " of " + rows.length + " arrests."
          : rows.length + " arrest" + (rows.length === 1 ? "" : "s") + " in this period.";
    }
  }

  function boardRows() {
    return [
      { key: "stops", label: "Stops", kind: "count" },
      { key: "hit", label: "Hit rate", kind: "rate", num: "hits", explain: "hit" },
      { key: "yield", label: "Yield", kind: "yield", num: "arrests", explain: "yield" },
      { key: "flee", label: "Flee rate", kind: "yield", num: "fled", explain: "flee" },
      {
        key: "targetYield",
        label: "Target yield",
        kind: "yield",
        explain: "targetYield"
      },
      {
        key: "collateralYield",
        label: "Collateral yield",
        kind: "yield",
        explain: "collateralYield"
      },
      { key: "empty", label: "Empty-handed", kind: "rate", num: "empty", explain: "empty" }
    ];
  }

  function familyCellLabel(family, row) {
    if (row.kind === "count") {
      return String(family.stops);
    }
    if (row.key === "hit") {
      return family.hitLabel;
    }
    if (row.key === "yield") {
      return family.yieldLabel;
    }
    if (row.key === "flee") {
      return family.fleeLabel;
    }
    if (row.key === "targetYield") {
      return family.targetYieldLabel;
    }
    if (row.key === "collateralYield") {
      return family.collateralYieldLabel;
    }
    if (row.key === "empty") {
      return family.emptyLabel;
    }
    return "—";
  }

  function paintBoard(summary) {
    var body = byId("oracleBoardBody");
    if (!body || !summary.families) {
      return;
    }
    body.replaceChildren();
    var selected = chipValue("data-oracle-kpi", "hit");
    boardRows().forEach(function (row) {
      var tr = document.createElement("tr");
      if (row.explain && row.explain === selected) {
        tr.className = "is-selected";
      }
      var th = document.createElement("th");
      th.scope = "row";
      if (row.explain) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "oracle-board-metric";
        btn.setAttribute("data-oracle-kpi", row.explain);
        btn.textContent = row.label;
        th.appendChild(btn);
      } else {
        th.textContent = row.label;
      }
      tr.appendChild(th);
      ["cop", "dynamic", "all"].forEach(function (fam) {
        var td = document.createElement("td");
        td.textContent = familyCellLabel(summary.families[fam], row);
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    var copShare = summary.shares.cop;
    var dynShare = summary.shares.dynamic;
    setText(
      "oracleShare",
      "Cop-stop share of arrests " +
        (copShare == null ? "—" : Math.round(copShare * 100) + "%") +
        " · Dynamic share of arrests " +
        (dynShare == null ? "—" : Math.round(dynShare * 100) + "%") +
        " (" +
        summary.shares.copArrests +
        " / " +
        summary.shares.dynamicArrests +
        " of " +
        summary.shares.allArrests +
        ")"
    );
    var other = summary.families.other;
    setText(
      "oracleOtherNote",
      other.stops
        ? other.stops +
            " worksite/other stop" +
            (other.stops === 1 ? "" : "s") +
            " not in the cop or dynamic columns."
        : "No worksite/other stops in this period."
    );
  }

  function teamSortValue(row, sort) {
    if (sort === "hit") {
      return row.hit;
    }
    if (sort === "perDay") {
      return row.perActiveDay;
    }
    if (sort === "raw") {
      return row.arrests;
    }
    return row.yield;
  }

  function paintTeams(summary) {
    var empty = byId("oracleTeamEmpty");
    var wrap = byId("oracleTeamWrap");
    var body = byId("oracleTeamBody");
    var note = byId("oracleTeamNote");
    if (!body) {
      return;
    }
    body.replaceChildren();
    var rows = (summary.teamRows || []).slice();
    if (!rows.length) {
      if (empty) {
        empty.hidden = false;
      }
      if (wrap) {
        wrap.hidden = true;
      }
      if (note) {
        note.textContent = "No completed stops to compare.";
      }
      return;
    }
    if (empty) {
      empty.hidden = true;
    }
    if (wrap) {
      wrap.hidden = false;
    }
    var sort = chipValue("data-oracle-team-sort", "yield");
    var meanYield = mean(
      rows
        .filter(function (row) {
          return row.stops > 0 && row.yield != null;
        })
        .map(function (row) {
          return row.yield;
        })
    );
    rows.sort(function (a, b) {
      var av = teamSortValue(a, sort);
      var bv = teamSortValue(b, sort);
      if (av == null && bv == null) {
        return 0;
      }
      if (av == null) {
        return 1;
      }
      if (bv == null) {
        return -1;
      }
      return bv - av || b.stops - a.stops || String(a.label).localeCompare(b.label);
    });
    var selected = summary.team || "";
    rows.forEach(function (row) {
      var tr = document.createElement("tr");
      tr.className = "oracle-team-row";
      tr.setAttribute("data-team", row.team === "unassigned" ? "" : row.team);
      if (selected && selected === row.team) {
        tr.classList.add("is-selected");
      }
      function td(value) {
        var cell = document.createElement("td");
        cell.textContent = value;
        tr.appendChild(cell);
      }
      td(row.label);
      td(String(row.stops));
      td(String(row.arrests));
      td(row.hitLabel);
      td(row.yieldLabel);
      td(row.perActiveDay == null ? "—" : formatNum(row.perActiveDay, 2));
      td(row.cop.yieldLabel);
      td(row.dynamic.yieldLabel);
      td(row.fleeLabel);
      td(row.emptyLabel);
      td(
        meanYield && row.yield != null
          ? String(Math.round((row.yield / meanYield) * 100))
          : "—"
      );
      body.appendChild(tr);
    });
    if (note) {
      note.textContent =
        rows.length +
        " team" +
        (rows.length === 1 ? "" : "s") +
        " · sorted by " +
        (sort === "hit"
          ? "hit rate"
          : sort === "perDay"
            ? "arrests per active day"
            : sort === "raw"
              ? "raw arrests"
              : "yield") +
        ". Index 100 = mean yield. Click a row to set the scope team.";
    }
  }

  function paintPlaces(summary) {
    var empty = byId("oraclePlaceEmpty");
    var wrap = byId("oraclePlaceWrap");
    var body = byId("oraclePlaceBody");
    if (!empty || !wrap || !body) {
      return;
    }
    body.replaceChildren();
    if (!summary.places.length) {
      empty.hidden = false;
      wrap.hidden = true;
      return;
    }
    empty.hidden = true;
    wrap.hidden = false;
    summary.places.forEach(function (row) {
      var tr = document.createElement("tr");
      tr.className = "oracle-place-row";
      tr.setAttribute("data-lat", String(row.lat || ""));
      tr.setAttribute("data-lng", String(row.lng || ""));
      function td(value) {
        var cell = document.createElement("td");
        cell.textContent = value;
        tr.appendChild(cell);
      }
      td(row.city);
      td(String(row.stops));
      td(row.hitLabel);
      td(row.yieldLabel);
      td(row.fleeLabel);
      td(String(row.cop));
      td(String(row.dynamic));
      body.appendChild(tr);
    });
  }

  function selectedNorm() {
    return chipValue("data-oracle-norm", "raw");
  }

  function metricSeries(rows, mode, occurrences) {
    var values = [];
    (rows || []).forEach(function (row) {
      if (!row || !row.stops) {
        return;
      }
      var occ =
        occurrences && row.weekday != null ? occurrences[row.weekday] : 1;
      var value = cellMetric(row, mode, occ);
      if (value != null && isFinite(value)) {
        values.push(value);
      }
    });
    return describe(values);
  }

  function formatNormValue(value, mode) {
    if (value == null || !isFinite(value)) {
      return "—";
    }
    if (mode === "index") {
      return String(Math.round(value));
    }
    if (mode === "z") {
      return (value >= 0 ? "+" : "") + value.toFixed(1);
    }
    if (mode === "perStop" || mode === "perWeekday") {
      return value.toFixed(2);
    }
    return String(Math.round(value * 10) / 10);
  }

  function normalizeValue(value, stats, mode) {
    if (value == null || !isFinite(value)) {
      return null;
    }
    if (mode === "index") {
      return stats && stats.mean ? (value / stats.mean) * 100 : null;
    }
    if (mode === "z") {
      return stats && stats.sd ? (value - stats.mean) / stats.sd : null;
    }
    return value;
  }

  function displayNorm(row, mode, stats, occurrences) {
    if (!row || !row.stops) {
      return "—";
    }
    var occ = occurrences && row.weekday != null ? occurrences[row.weekday] : 1;
    var raw = cellMetric(row, mode === "index" || mode === "z" ? "perStop" : mode, occ);
    if (mode === "raw") {
      raw = row.arrests;
    }
    var shown = normalizeValue(raw, stats, mode);
    return formatNormValue(shown, mode);
  }

  function heatFor(value, stats) {
    if (value == null || !stats || stats.max == null || stats.max === stats.min) {
      return "";
    }
    var t = (value - stats.min) / (stats.max - stats.min);
    if (t < 0) {
      t = 0;
    }
    if (t > 1) {
      t = 1;
    }
    return "rgba(85, 199, 189, " + (0.12 + t * 0.45).toFixed(2) + ")";
  }

  function bestWeekday(weekdays) {
    var enough = (weekdays || []).filter(function (row) {
      return row.stops >= CELL_MIN && row.yield != null;
    });
    var pool = enough.length
      ? enough
      : (weekdays || []).filter(function (row) {
          return row.stops > 0 && row.yield != null;
        });
    if (!pool.length) {
      return null;
    }
    pool = pool.slice().sort(function (a, b) {
      return b.yield - a.yield || b.arrests - a.arrests;
    });
    return pool[0];
  }

  function paintSpread(summary) {
    var spread = summary.spread || {};
    function paintStat(prefix, desc) {
      desc = desc || {};
      setText(prefix + "Mean", formatNum(desc.mean, 2));
      setText(prefix + "Median", formatNum(desc.median, 2));
      setText(prefix + "Sd", formatNum(desc.sd, 2));
      setText(prefix + "N", desc.n ? String(desc.n) : "—");
    }
    paintStat("oracleSpreadDay", spread.arrestsPerActiveDay);
    paintStat("oracleSpreadCal", spread.arrestsPerCalendarDay);
    paintStat("oracleSpreadYield", spread.yieldPerStop);
    setText(
      "oracleSpreadNote",
      (spread.activeDays || 0) +
        " active day" +
        (spread.activeDays === 1 ? "" : "s") +
        " · " +
        (spread.calendarDays || 0) +
        " calendar day" +
        (spread.calendarDays === 1 ? "" : "s") +
        " in range. Mean is the average. Median is the middle. SD needs 2+ days or stops."
    );
  }

  function paintWeekday(summary) {
    var body = byId("oracleWeekdayBody");
    var note = byId("oracleWeekdayNote");
    if (!body) {
      return;
    }
    body.replaceChildren();
    var mode = selectedNorm();
    var occ = summary.weekdayOccurrences || [1, 1, 1, 1, 1, 1, 1];
    var seriesMode = mode === "index" || mode === "z" ? "perStop" : mode;
    var stats = metricSeries(summary.weekdays, seriesMode, occ);
    (summary.weekdays || []).forEach(function (row) {
      var tr = document.createElement("tr");
      var raw = cellMetric(
        row,
        seriesMode,
        occ[row.weekday]
      );
      if (row.stops) {
        tr.style.background = heatFor(
          mode === "raw" ? row.arrests : raw,
          metricSeries(summary.weekdays, mode === "raw" ? "raw" : seriesMode, occ)
        );
      }
      function td(value) {
        var cell = document.createElement("td");
        cell.textContent = value;
        tr.appendChild(cell);
      }
      td(row.label);
      td(String(row.stops));
      td(String(row.arrests));
      td(row.hitLabel);
      td(row.cop.yieldLabel);
      td(row.dynamic.yieldLabel);
      td(displayNorm(row, mode, stats, occ));
      body.appendChild(tr);
    });
    var best = bestWeekday(summary.weekdays);
    if (note) {
      note.textContent = best
        ? "Best yield: " +
          best.label +
          " · " +
          best.yieldLabel +
          " across " +
          best.stops +
          " stop" +
          (best.stops === 1 ? "" : "s") +
          ". Raw volume is not the best-day rule."
        : "No completed stops in this period.";
    }
  }

  function paintPlaceDays(summary) {
    var empty = byId("oraclePlaceDayEmpty");
    var wrap = byId("oraclePlaceDayWrap");
    var body = byId("oraclePlaceDayBody");
    if (!empty || !wrap || !body) {
      return;
    }
    body.replaceChildren();
    var rows = summary.placeWeekdays || [];
    if (!rows.length) {
      empty.hidden = false;
      wrap.hidden = true;
      return;
    }
    empty.hidden = true;
    wrap.hidden = false;
    var mode = selectedNorm();
    var occ = summary.weekdayOccurrences || [1, 1, 1, 1, 1, 1, 1];
    var seriesMode = mode === "index" || mode === "z" ? "perStop" : mode;
    var cells = [];
    rows.forEach(function (row) {
      row.days.forEach(function (day, index) {
        if (!day.stops) {
          return;
        }
        day.weekday = index;
        cells.push(day);
      });
    });
    var stats = metricSeries(cells, seriesMode, occ);
    var heatStats = metricSeries(cells, mode === "raw" ? "raw" : seriesMode, occ);
    rows.forEach(function (row) {
      var tr = document.createElement("tr");
      tr.className = "oracle-place-row";
      tr.setAttribute("data-lat", String(row.lat || ""));
      tr.setAttribute("data-lng", String(row.lng || ""));
      var name = document.createElement("th");
      name.scope = "row";
      name.textContent = row.city;
      tr.appendChild(name);
      row.days.forEach(function (day, index) {
        day.weekday = index;
        var td = document.createElement("td");
        td.className = "oracle-heat-cell";
        if (day.stops) {
          var raw = cellMetric(
            day,
            mode === "raw" ? "raw" : seriesMode,
            occ[index]
          );
          if (mode === "raw") {
            raw = day.arrests;
          }
          td.textContent = displayNorm(day, mode, stats, occ);
          td.style.background = heatFor(raw, heatStats);
          td.title =
            row.city +
            " " +
            WEEKDAYS[index] +
            " · " +
            day.stops +
            " stop(s) · " +
            day.arrests +
            " arrest(s) · yield " +
            (day.yield == null ? "—" : day.yield.toFixed(2));
        } else {
          td.textContent = "·";
          td.classList.add("is-empty");
        }
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }

  function paintUnlocated(summary) {
    var list = byId("oracleUnlocated");
    var note = byId("oracleUnlocatedNote");
    if (!list || !note) {
      return;
    }
    list.replaceChildren();
    if (!summary.unlocated.length) {
      list.hidden = true;
      note.textContent = "Every completed stop in this period has a pin.";
      return;
    }
    list.hidden = false;
    note.textContent =
      summary.unlocated.length +
      " completed stop(s) with no pin. They stay in the rates.";
    summary.unlocated.forEach(function (stop) {
      var li = document.createElement("li");
      var link = document.createElement("a");
      link.href = "encounter-form.html?id=" + encodeURIComponent(stop.encounterId);
      link.textContent = stop.encounterId || "Encounter";
      li.appendChild(link);
      var meta = document.createElement("span");
      meta.className = "dash-meta";
      meta.textContent = [stop.startedAt, familyLabel(stop.family), stop.eventTypeLabel]
        .filter(Boolean)
        .join(" · ");
      li.appendChild(meta);
      list.appendChild(li);
    });
  }

  function paintExplain(kpi) {
    var el = byId("oracleExplain");
    if (!el) {
      return;
    }
    el.textContent = EXPLAIN[kpi] || EXPLAIN.hit;
  }

  function escapeHtml(value) {
    return text(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function familyColor(family) {
    if (family === "dynamic") {
      return "#f0ad35";
    }
    if (family === "cop") {
      return "#55c7bd";
    }
    return "#7d909e";
  }

  function metricValue(cell, metric) {
    if (metric === "yield") {
      return cell.yield;
    }
    if (metric === "flee") {
      return cell.flee;
    }
    if (metric === "empty") {
      return cell.emptyRate;
    }
    return cell.hit;
  }

  function heatColor(value, metric) {
    var t = value == null ? 0 : value;
    if (metric === "yield") {
      t = Math.min(1, t / 2);
    }
    var from = [26, 42, 50];
    var to = metric === "flee" || metric === "empty" ? [233, 104, 104] : [85, 199, 189];
    var r = Math.round(from[0] + (to[0] - from[0]) * t);
    var g = Math.round(from[1] + (to[1] - from[1]) * t);
    var b = Math.round(from[2] + (to[2] - from[2]) * t);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function popupForStop(stop) {
    return (
      "<strong>" +
      escapeHtml(stop.encounterId) +
      "</strong><br>" +
      escapeHtml(familyLabel(stop.family)) +
      " · " +
      escapeHtml(stop.eventTypeLabel) +
      "<br>" +
      "Arrested " +
      stop.arrested +
      " · Fled " +
      stop.fled +
      " · Released " +
      stop.released +
      "<br>" +
      "<a href=\"encounter-form.html?id=" +
      encodeURIComponent(stop.encounterId) +
      "\">Open encounter</a>"
    );
  }

  function popupForCell(cell, metric) {
    return (
      "<strong>Cell " +
      escapeHtml(cell.key) +
      "</strong><br>" +
      "All: hit " +
      escapeHtml(cell.hitLabel) +
      " · yield " +
      escapeHtml(cell.yieldLabel) +
      "<br>" +
      "Cop: " +
      cell.cop.stops +
      " stops, hit " +
      escapeHtml(cell.cop.hitLabel) +
      "<br>" +
      "Dynamic: " +
      cell.dynamic.stops +
      " stops, hit " +
      escapeHtml(cell.dynamic.hitLabel) +
      (cell.stops < CELL_MIN ? "<br>Small sample — faint on purpose." : "")
    );
  }

  function ensureMap() {
    var host = byId("oracleMap");
    var L = global.L;
    if (!host || !L) {
      return null;
    }
    if (mapState && mapState.map) {
      return mapState;
    }
    var map = L.map(host, { scrollWheelZoom: true });
    var streets = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap"
    });
    streets.addTo(map);
    streets.on("tileerror", function () {
      host.classList.add("is-plain-basemap");
    });
    map.setView(DALLAS, 10);
    mapState = {
      map: map,
      dots: L.layerGroup().addTo(map),
      cells: L.layerGroup().addTo(map)
    };
    return mapState;
  }

  function visibleStops(summary) {
    var family = chipValue("data-oracle-map-family", "all");
    var outcome = chipValue("data-oracle-map-outcome", "all");
    return (summary.stops || []).filter(function (stop) {
      if (!stop.mapped) {
        return false;
      }
      if (family !== "all" && stop.family !== family) {
        return false;
      }
      if (outcome !== "all" && stop.outcome !== outcome) {
        return false;
      }
      return true;
    });
  }

  function visibleCells(summary) {
    var family = chipValue("data-oracle-map-family", "all");
    return (summary.cells || [])
      .map(function (cell) {
        if (family === "cop") {
          return Object.assign({ key: cell.key, lat: cell.lat, lng: cell.lng, bounds: cell.bounds, cop: cell.cop, dynamic: cell.dynamic }, cell.cop);
        }
        if (family === "dynamic") {
          return Object.assign({ key: cell.key, lat: cell.lat, lng: cell.lng, bounds: cell.bounds, cop: cell.cop, dynamic: cell.dynamic }, cell.dynamic);
        }
        return cell;
      })
      .filter(function (cell) {
        return cell.stops > 0;
      });
  }

  function paintMap(summary) {
    var note = byId("oracleMapCoverage");
    var host = byId("oracleMap");
    var mapped = (summary.stops || []).filter(function (stop) {
      return stop.mapped;
    }).length;
    if (note) {
      note.textContent =
        mapped +
        " of " +
        summary.stops.length +
        " completed stops mapped.";
    }
    if (!global.L || !host) {
      if (note) {
        note.textContent += " Leaflet did not load — table still works.";
      }
      return;
    }
    var state = ensureMap();
    if (!state) {
      return;
    }
    state.dots.clearLayers();
    state.cells.clearLayers();
    var layer = chipValue("data-oracle-map-layer", "both");
    var metric = chipValue("data-oracle-map-metric", "hit");
    var L = global.L;
    var bounds = [];
    if (layer === "cells" || layer === "both") {
      visibleCells(summary).forEach(function (cell) {
        if (!cell.bounds) {
          return;
        }
        var rect = L.rectangle(cell.bounds, {
          color: heatColor(metricValue(cell, metric), metric),
          weight: 1,
          fillColor: heatColor(metricValue(cell, metric), metric),
          fillOpacity: cell.stops < CELL_MIN ? 0.15 : 0.35
        });
        rect.bindPopup(popupForCell(cell, metric));
        state.cells.addLayer(rect);
        bounds.push(cell.bounds[0]);
        bounds.push(cell.bounds[1]);
      });
    }
    if (layer === "dots" || layer === "both") {
      visibleStops(summary).forEach(function (stop) {
        var marker = L.circleMarker([stop.lat, stop.lng], {
          radius: stop.arrested > 1 ? 8 : 6,
          color: stop.outcome === "flee" ? "#e96868" : familyColor(stop.family),
          weight: stop.outcome === "flee" ? 3 : 1,
          fillColor: familyColor(stop.family),
          fillOpacity: stop.outcome === "empty" ? 0.2 : 0.9,
          dashArray: stop.outcome === "empty" ? "3 3" : null
        });
        marker.bindPopup(popupForStop(stop));
        state.dots.addLayer(marker);
        bounds.push([stop.lat, stop.lng]);
      });
    }
    if (bounds.length) {
      state.map.fitBounds(bounds, { padding: [24, 24], maxZoom: 13 });
    } else {
      state.map.setView(DALLAS, 10);
    }
    setTimeout(function () {
      state.map.invalidateSize();
    }, 0);
  }

  function zoomTo(lat, lng) {
    if (!mapState || !mapState.map || !hasCoords(lat, lng)) {
      return;
    }
    mapState.map.setView([Number(lat), Number(lng)], 13);
  }

  function catalogsFromPage() {
    return {
      countries: global.COUNTRIES || [],
      dispositions: global.IMMIGRATION_DISPOSITIONS || [],
      encounterTypes:
        (root.catalogs && root.catalogs.ENCOUNTER_TYPES) || []
    };
  }

  function loadWorkspace() {
    var store = model.store;
    if (!store) {
      return { leads: [], encounters: [] };
    }
    if (typeof store.loadFromDisk === "function") {
      store.loadFromDisk();
    }
    var leads = (store.listLeads() || [])
      .map(function (row) {
        return store.getLead(row.leadId);
      })
      .filter(Boolean);
    var encounters = (store.listEncounters() || [])
      .map(function (row) {
        return store.getEncounter(row.encounterId);
      })
      .filter(Boolean);
    return { leads: leads, encounters: encounters };
  }

  function fillTeams(select, teams, current) {
    if (!select) {
      return;
    }
    var keep = current || select.value || "";
    select.replaceChildren();
    var all = document.createElement("option");
    all.value = "";
    all.textContent = "All teams";
    select.appendChild(all);
    teams.forEach(function (team) {
      var option = document.createElement("option");
      option.value = team;
      option.textContent = "Team " + team;
      select.appendChild(option);
    });
    var still = Array.prototype.some.call(select.options, function (option) {
      return option.value === keep;
    });
    select.value = still ? keep : "";
  }

  function selectedPeriod() {
    return chipValue("data-oracle-period", "today");
  }

  function paint(summary) {
    setText("oracleStatArrests", String(summary.arrests));
    setText(
      "oracleStatEncountersWithArrests",
      String(summary.encountersWithArrests)
    );
    setText("oracleStatCompleted", String(summary.completedEncounters));
    setText("oracleStatUnmapped", String(summary.unlocated.length));
    setText("oracleSentence", sentence(summary));
    setText(
      "oracleSentenceMeta",
      [
        rangeLabel(summary),
        "stops = completed encounter start",
        "X = booked arrest date",
        summary.team ? "team " + summary.team : "all teams"
      ]
        .filter(Boolean)
        .join(" · ")
    );
    paintBoard(summary);
    paintTeams(summary);
    paintExplain(chipValue("data-oracle-kpi", "hit"));
    paintSpread(summary);
    paintMap(summary);
    paintPlaces(summary);
    paintWeekday(summary);
    paintPlaceDays(summary);
    paintUnlocated(summary);
    paintMix("oracleMixDisposition", summary.mix.disposition);
    paintMix("oracleMixEvent", summary.mix.eventType);
    paintMix("oracleMixCountry", summary.mix.country);
    paintMix("oracleMixRole", summary.mix.role);
    paintSpark(summary.spark);
    paintQuality(summary);
    paintTable(summary.rows);
    fillTeams(byId("oracleTeam"), summary.teams, summary.team);
  }

  function run() {
    var range = periodRange(
      selectedPeriod(),
      new Date(),
      byId("oracleFrom") && byId("oracleFrom").value,
      byId("oracleTo") && byId("oracleTo").value
    );
    var workspace = loadWorkspace();
    var summary = summarize({
      leads: workspace.leads,
      encounters: workspace.encounters,
      from: range.from,
      to: range.to,
      team: (byId("oracleTeam") && byId("oracleTeam").value) || "",
      catalogs: catalogsFromPage()
    });
    paint(summary);
    return summary;
  }

  function bindChips(attr) {
    document.querySelectorAll("[" + attr + "]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll("[" + attr + "]").forEach(function (other) {
          other.setAttribute("aria-pressed", other === btn ? "true" : "false");
        });
        run();
      });
    });
  }

  function bind() {
    document.querySelectorAll("[data-oracle-period]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll("[data-oracle-period]").forEach(function (other) {
          other.setAttribute("aria-pressed", other === btn ? "true" : "false");
        });
        var custom = byId("oracleCustomDates");
        var isCustom = btn.getAttribute("data-oracle-period") === "custom";
        if (custom) {
          custom.hidden = !isCustom;
        }
        if (isCustom) {
          var today = localDay(new Date());
          if (byId("oracleFrom") && !byId("oracleFrom").value) {
            byId("oracleFrom").value = today;
          }
          if (byId("oracleTo") && !byId("oracleTo").value) {
            byId("oracleTo").value = today;
          }
        }
        run();
      });
    });
    bindChips("data-oracle-map-family");
    bindChips("data-oracle-map-layer");
    bindChips("data-oracle-map-metric");
    bindChips("data-oracle-map-outcome");
    bindChips("data-oracle-norm");
    bindChips("data-oracle-team-sort");
    var teamBody = byId("oracleTeamBody");
    if (teamBody) {
      teamBody.addEventListener("click", function (event) {
        var row =
          event.target && event.target.closest
            ? event.target.closest("[data-team]")
            : null;
        var select = byId("oracleTeam");
        if (!row || !select) {
          return;
        }
        select.value = row.getAttribute("data-team") || "";
        run();
      });
    }
    var board = byId("oracleBoardBody");
    if (board) {
      board.addEventListener("click", function (event) {
        var btn =
          event.target && event.target.closest
            ? event.target.closest("[data-oracle-kpi]")
            : null;
        if (!btn) {
          return;
        }
        document.querySelectorAll("[data-oracle-kpi]").forEach(function (other) {
          other.setAttribute("aria-pressed", other === btn ? "true" : "false");
        });
        run();
      });
    }
    function bindZoom(id) {
      var host = byId(id);
      if (!host) {
        return;
      }
      host.addEventListener("click", function (event) {
        var row =
          event.target && event.target.closest
            ? event.target.closest("[data-lat]")
            : null;
        if (!row) {
          return;
        }
        zoomTo(row.getAttribute("data-lat"), row.getAttribute("data-lng"));
      });
    }
    bindZoom("oraclePlaceBody");
    bindZoom("oraclePlaceDayBody");
    var team = byId("oracleTeam");
    if (team) {
      team.addEventListener("change", run);
    }
    var from = byId("oracleFrom");
    var to = byId("oracleTo");
    if (from) {
      from.addEventListener("change", run);
    }
    if (to) {
      to.addEventListener("change", run);
    }
  }

  root.oracle = {
    periodRange: periodRange,
    summarize: summarize,
    sentence: sentence,
    familyOf: familyOf,
    formatRate: formatRate,
    formatYield: formatYield,
    gridKey: gridKey,
    describe: describe,
    weekdayOf: weekdayOf,
    mean: mean,
    median: median,
    stdev: stdev
  };

  if (
    typeof document === "undefined" ||
    !document.body ||
    document.body.getAttribute("data-page") !== "oracle"
  ) {
    return;
  }
  bind();
  run();
})(typeof window !== "undefined" ? window : globalThis);
