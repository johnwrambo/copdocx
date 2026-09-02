/**
 * Shared pin card for case map and planning map.
 * Photo is of the object (LOCATION / VEHICLE / PERSON / OFFICER).
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
    img.alt = pin.title || "Location photo";
    photo.appendChild(img);
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
    wrap.appendChild(body);
    wrap._photoBox = photo;
    wrap._photoImg = img;
    if (pin.photoDataUrl) {
      img.src = pin.photoDataUrl;
      photo.hidden = false;
      wrap._photoLoaded = true;
    }
    return wrap;
  }

  function fill(cardEl, pin, urlBag) {
    if (!cardEl || cardEl._photoLoaded) {
      return;
    }
    pin = pin || {};
    if (pin.photoDataUrl && cardEl._photoImg) {
      cardEl._photoImg.src = pin.photoDataUrl;
      cardEl._photoBox.hidden = false;
      cardEl._photoLoaded = true;
      return;
    }
    var api = root.media;
    var owners = pin.photoOwners || [];
    var bag = urlBag || [];
    if (!api || !owners.length) {
      return;
    }
    function tryOwner(index) {
      if (index >= owners.length) {
        return;
      }
      var owner = owners[index];
      if (!owner || !owner.id) {
        tryOwner(index + 1);
        return;
      }
      api
        .list(owner)
        .catch(function () {
          return [];
        })
        .then(function (rows) {
          var photos = (rows || []).filter(function (row) {
            return (
              row &&
              row.mediaClass === "photo" &&
              (!row.meta || row.meta.status !== "draft")
            );
          });
          var primary =
            photos.filter(function (row) {
              return row.primary;
            })[0] || photos[0];
          if (!primary) {
            tryOwner(index + 1);
            return;
          }
          return api
            .blob(primary.mediaId, "thumb")
            .catch(function () {
              return api.blob(primary.mediaId, "display");
            })
            .then(function (rec) {
              var blob = rec && asPopupBlob(rec.blob);
              if (!blob) {
                tryOwner(index + 1);
                return;
              }
              var url = URL.createObjectURL(blob);
              bag.push(url);
              cardEl._photoImg.src = url;
              cardEl._photoBox.hidden = false;
              cardEl._photoLoaded = true;
            });
        })
        .catch(function () {
          tryOwner(index + 1);
        });
    }
    tryOwner(0);
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
    options: OPTIONS
  };
})(typeof window !== "undefined" ? window : globalThis);
