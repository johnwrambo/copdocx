/**
 * Shared pin card for case map and planning map.
 * Shows the mapped object photo plus an associated person/officer when available.
 * Reads copdocx.media.v1. Does not write leads, admin, book-in, or media.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});

  var OPTIONS = {
    className: "case-map-popup-wrap",
    maxWidth: 240,
    minWidth: 168,
    closeButton: true,
    autoPan: true
  };

  function asPopupBlob(payload) {
    if (!payload) {
      return null;
    }
    if (typeof Blob !== "undefined" && payload instanceof Blob) {
      return payload;
    }
    if (payload.buffer && payload.byteLength != null) {
      return new Blob([payload]);
    }
    return payload;
  }

  function card(pin) {
    pin = pin || {};
    var wrap = document.createElement("div");
    wrap.className = "case-map-popup";
    var photo = document.createElement("div");
    photo.className = "case-map-popup-photo";
    photo.hidden = true;
    var img = document.createElement("img");
    img.className = "case-map-popup-photo-main";
    img.alt = pin.title || "Location photo";
    img.hidden = true;
    photo.appendChild(img);
    var personImg = document.createElement("img");
    personImg.className = "case-map-popup-photo-person";
    personImg.alt = pin.title ? "Associated person for " + pin.title : "Associated person";
    personImg.hidden = true;
    photo.appendChild(personImg);
    wrap.appendChild(photo);
    var body = document.createElement("div");
    body.className = "case-map-popup-body";
    if (pin.title) {
      var strong = document.createElement("strong");
      strong.textContent = pin.title + (pin.isPrimary ? " · Primary" : "");
      body.appendChild(strong);
    }
    if (pin.extra) {
      var extra = document.createElement("div");
      extra.className = "case-map-popup-extra";
      extra.textContent = pin.extra;
      body.appendChild(extra);
    }
    if (pin.address) {
      var addr = document.createElement("div");
      addr.className = "case-map-popup-address";
      addr.textContent = pin.address;
      body.appendChild(addr);
    } else if (pin.meta && pin.meta !== pin.title && pin.meta !== pin.extra) {
      var meta = document.createElement("div");
      meta.className = "case-map-popup-address";
      meta.textContent = pin.meta;
      body.appendChild(meta);
    }
    if (pin.occupancy) {
      var occ = document.createElement("div");
      occ.className = "case-map-popup-meta";
      occ.textContent = pin.occupancy;
      body.appendChild(occ);
    }
    if (pin.caseUrl) {
      var actions = document.createElement("div");
      actions.className = "case-map-popup-actions";
      var caseLink = document.createElement("a");
      var winName = pin.caseWindowName || "copdoc-case-view";
      caseLink.className = "case-map-popup-case-link";
      caseLink.href = pin.caseUrl;
      caseLink.target = winName;
      caseLink.rel = "opener";
      caseLink.textContent = pin.caseLabel || "Open case";
      caseLink.addEventListener("click", function (event) {
        if (
          event.defaultPrevented ||
          event.button ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") {
          event.stopImmediatePropagation();
        }
        openCasePopup(caseLink.href || pin.caseUrl, winName);
      });
      actions.appendChild(caseLink);
      body.appendChild(actions);
    }
    wrap.appendChild(body);
    wrap._photoBox = photo;
    wrap._photoImg = img;
    wrap._personPhotoImg = personImg;
    var objectData = pin.objectPhotoDataUrl || pin.photoDataUrl || "";
    var personData = pin.personPhotoDataUrl || "";
    if (objectData) {
      img.src = objectData;
      img.hidden = false;
      photo.hidden = false;
      wrap._objectPhotoLoaded = true;
    }
    if (personData) {
      personImg.src = personData;
      wrap._personPhotoLoaded = true;
      if (objectData) {
        personImg.hidden = false;
        photo.className = "case-map-popup-photo has-person-photo";
      } else {
        img.src = personData;
        img.hidden = false;
        photo.hidden = false;
      }
    }
    wrap._photoLoaded = !!(objectData || personData);
    return wrap;
  }

  function photoOwners(pin, key, legacy) {
    if (Array.isArray(pin[key])) {
      return pin[key];
    }
    return legacy ? pin.photoOwners || [] : [];
  }

  function firstPhotoUrl(api, owners, bag, index) {
    index = index || 0;
    if (!api || index >= owners.length) {
      return Promise.resolve("");
    }
    var owner = owners[index];
    if (!owner || !owner.id) {
      return firstPhotoUrl(api, owners, bag, index + 1);
    }
    return api.list(owner).catch(function () {
      return [];
    }).then(function (rows) {
      var photos = (rows || []).filter(function (row) {
        return (
          row &&
          row.mediaClass === "photo" &&
          (!row.meta || row.meta.status !== "draft")
        );
      });
      var primary = photos.filter(function (row) {
        return row.primary;
      })[0] || photos[0];
      if (!primary) {
        return firstPhotoUrl(api, owners, bag, index + 1);
      }
      return api.blob(primary.mediaId, "thumb").catch(function () {
        return api.blob(primary.mediaId, "display");
      }).then(function (rec) {
        var blob = rec && asPopupBlob(rec.blob);
        if (!blob) {
          return firstPhotoUrl(api, owners, bag, index + 1);
        }
        var url = URL.createObjectURL(blob);
        bag.push(url);
        return url;
      });
    }).catch(function () {
      return firstPhotoUrl(api, owners, bag, index + 1);
    });
  }

  function paintPhotos(cardEl, objectUrl, personUrl) {
    var main = cardEl._photoImg;
    var person = cardEl._personPhotoImg;
    if (objectUrl) {
      main.src = objectUrl;
      main.hidden = false;
      cardEl._objectPhotoLoaded = true;
    }
    if (personUrl) {
      person.src = personUrl;
      cardEl._personPhotoLoaded = true;
    }
    if (cardEl._objectPhotoLoaded && cardEl._personPhotoLoaded) {
      person.hidden = false;
      cardEl._photoBox.className = "case-map-popup-photo has-person-photo";
    } else if (!cardEl._objectPhotoLoaded && cardEl._personPhotoLoaded) {
      main.src = person.src;
      main.hidden = false;
      person.hidden = true;
    }
    cardEl._photoBox.hidden = !(cardEl._objectPhotoLoaded || cardEl._personPhotoLoaded);
    cardEl._photoLoaded = !cardEl._photoBox.hidden;
  }

  function fill(cardEl, pin, urlBag) {
    if (!cardEl || cardEl._photoLoading) {
      return;
    }
    pin = pin || {};
    var api = root.media;
    var hasExplicitGroups =
      Array.isArray(pin.objectPhotoOwners) || Array.isArray(pin.personPhotoOwners);
    var objectOwners = photoOwners(pin, "objectPhotoOwners", !hasExplicitGroups);
    var personOwners = photoOwners(pin, "personPhotoOwners", false);
    var bag = urlBag || [];
    if (!api || (!objectOwners.length && !personOwners.length)) {
      return;
    }
    cardEl._photoLoading = true;
    Promise.all([
      cardEl._objectPhotoLoaded
        ? Promise.resolve("")
        : firstPhotoUrl(api, objectOwners, bag),
      cardEl._personPhotoLoaded
        ? Promise.resolve("")
        : firstPhotoUrl(api, personOwners, bag)
    ]).then(function (urls) {
      paintPhotos(cardEl, urls[0], urls[1]);
      cardEl._photoLoading = false;
    }).catch(function () {
      cardEl._photoLoading = false;
    });
  }

  function popupFeatures() {
    var availW = 1440;
    var availH = 900;
    var screenObj = global.screen;
    if (screenObj) {
      availW = Number(screenObj.availWidth || screenObj.width) || availW;
      availH = Number(screenObj.availHeight || screenObj.height) || availH;
    }
    var width = Math.min(880, Math.max(640, Math.round(availW * 0.42)));
    var height = Math.min(820, Math.max(560, Math.round(availH * 0.82)));
    var left = Math.max(16, availW - width - 28);
    var top = Math.max(16, Math.round((availH - height) / 2));
    return {
      width: width,
      height: height,
      left: left,
      top: top,
      text: [
        "popup=yes",
        "popup=true",
        "width=" + width,
        "height=" + height,
        "left=" + left,
        "top=" + top,
        "scrollbars=yes",
        "resizable=yes"
      ].join(",")
    };
  }

  function resolveHref(url) {
    var href = String(url || "");
    if (!href) {
      return "";
    }
    try {
      var base = global.location && global.location.href;
      if (typeof URL === "function" && base && /:/.test(String(base))) {
        return new URL(href, base).href;
      }
    } catch (err) {}
    return href;
  }

  function openCaseWindow(url, name) {
    var href = resolveHref(url);
    var winName = String(name || "copdoc-case-view");
    var size = popupFeatures();
    var win = null;
    if (!href || typeof global.open !== "function") {
      return null;
    }
    try {
      win = global.open(href, winName, size.text);
    } catch (err) {}
    if (!win) {
      return null;
    }
    try {
      if (typeof win.resizeTo === "function") {
        win.resizeTo(size.width, size.height);
      }
      if (typeof win.moveTo === "function") {
        win.moveTo(size.left, size.top);
      }
    } catch (err2) {}
    try {
      if (win.location && href) {
        win.location.replace(href);
      }
    } catch (err3) {}
    try {
      if (typeof win.focus === "function") {
        win.focus();
      }
    } catch (err4) {}
    return win;
  }

  function openCasePopup(url, name) {
    var href = resolveHref(url);
    if (!href) {
      return null;
    }
    var win = openCaseWindow(href, name);
    if (win) {
      return win;
    }
    try {
      if (typeof global.open === "function") {
        win = global.open(href, "_blank", popupFeatures().text);
      }
    } catch (err) {}
    return win || null;
  }

  function bind(marker, pin, urlBag) {
    if (!marker || typeof marker.bindPopup !== "function") {
      return null;
    }
    var cardEl = card(pin);
    marker.bindPopup(cardEl, OPTIONS);
    marker.on("popupopen", function () {
      fill(cardEl, pin, urlBag);
    });
    return cardEl;
  }

  function revoke(urls) {
    (urls || []).forEach(function (url) {
      if (url && String(url).indexOf("blob:") === 0) {
        URL.revokeObjectURL(url);
      }
    });
  }

  root.mapPopup = {
    card: card,
    fill: fill,
    bind: bind,
    revoke: revoke,
    openCasePopup: openCasePopup,
    options: OPTIONS
  };
})(typeof window !== "undefined" ? window : globalThis);
