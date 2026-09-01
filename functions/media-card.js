/**
 * Photo + files on an object view. Reads COPDoc.media. Does not write owners.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});

  function revoke(urls) {
    (urls || []).forEach(function (url) {
      if (url && String(url).indexOf("blob:") === 0) {
        URL.revokeObjectURL(url);
      }
    });
  }

  function asBlob(payload) {
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

  function objectUrl(rec, bag) {
    if (!rec || !rec.blob) {
      return "";
    }
    var blob = asBlob(rec.blob);
    var url = URL.createObjectURL(blob);
    bag.push(url);
    return url;
  }

  function unmount(host) {
    if (!host) {
      return;
    }
    revoke(host._mediaUrls);
    host._mediaUrls = [];
    host.replaceChildren();
  }

  function fileLabel(row) {
    return (
      (row.documentType || row.kind || "File") +
      (row.caption ? " · " + row.caption : "") +
      (row.originalName ? " · " + row.originalName : "")
    );
  }

  function fileListEl(files, api, urlBag) {
    var list = document.createElement("ul");
    list.className = "media-doc-items";
    files.forEach(function (row) {
      var li = document.createElement("li");
      var link = document.createElement("a");
      link.href = "#";
      link.textContent = fileLabel(row);
      link.addEventListener("click", function (event) {
        event.preventDefault();
        api.blob(row.mediaId, "original").then(function (rec) {
          var url = objectUrl(rec, urlBag);
          window.open(url, "_blank", "noopener");
        });
      });
      li.appendChild(link);
      list.appendChild(li);
    });
    return list;
  }

  function paintFileLinks(filesHost, files, api, urlBag, options) {
    if (!filesHost) {
      return;
    }
    filesHost.replaceChildren();
    if (!files.length) {
      filesHost.hidden = true;
      return;
    }
    filesHost.hidden = false;
    var title = document.createElement("h3");
    title.className = "snapshot-side-title";
    title.textContent = (options && options.fileTitle) || "Files";
    filesHost.appendChild(title);
    filesHost.appendChild(fileListEl(files, api, urlBag));
  }

  var gallery = {
    photos: [],
    index: 0,
    urls: [],
    api: null
  };

  function galleryEl() {
    var el = document.getElementById("mediaGallery");
    if (el) {
      return el;
    }
    el = document.createElement("div");
    el.id = "mediaGallery";
    el.className = "media-gallery";
    el.hidden = true;
    el.innerHTML =
      '<button type="button" class="media-gallery-close" aria-label="Close gallery">×</button>' +
      '<button type="button" class="media-gallery-prev" aria-label="Previous photo">‹</button>' +
      '<img class="media-gallery-image" alt="Photo">' +
      '<button type="button" class="media-gallery-next" aria-label="Next photo">›</button>' +
      '<p class="media-gallery-caption"></p>';
    document.body.appendChild(el);
    el.querySelector(".media-gallery-close").addEventListener("click", closeGallery);
    el.querySelector(".media-gallery-prev").addEventListener("click", function () {
      showGalleryAt(gallery.index - 1);
    });
    el.querySelector(".media-gallery-next").addEventListener("click", function () {
      showGalleryAt(gallery.index + 1);
    });
    el.addEventListener("click", function (event) {
      if (event.target === el) {
        closeGallery();
      }
    });
    document.addEventListener("keydown", function (event) {
      if (el.hidden) {
        return;
      }
      if (event.key === "Escape") {
        closeGallery();
      } else if (event.key === "ArrowLeft") {
        showGalleryAt(gallery.index - 1);
      } else if (event.key === "ArrowRight") {
        showGalleryAt(gallery.index + 1);
      }
    });
    return el;
  }

  function closeGallery() {
    var el = document.getElementById("mediaGallery");
    if (el) {
      el.hidden = true;
    }
    revoke(gallery.urls);
    gallery.urls = [];
  }

  function showGalleryAt(index) {
    var photos = gallery.photos;
    if (!photos.length || !gallery.api) {
      return;
    }
    gallery.index = (index + photos.length) % photos.length;
    var row = photos[gallery.index];
    var el = galleryEl();
    var img = el.querySelector(".media-gallery-image");
    var caption = el.querySelector(".media-gallery-caption");
    var prev = el.querySelector(".media-gallery-prev");
    var next = el.querySelector(".media-gallery-next");
    prev.hidden = photos.length < 2;
    next.hidden = photos.length < 2;
    el.hidden = false;
    gallery.api
      .blob(row.mediaId, "display")
      .catch(function () {
        return gallery.api.blob(row.mediaId, "original");
      })
      .then(function (rec) {
        var url = objectUrl(rec, gallery.urls);
        img.src = url;
        caption.textContent = [
          row.caption,
          row.takenAt && String(row.takenAt).slice(0, 10),
          photos.length > 1 ? gallery.index + 1 + " / " + photos.length : ""
        ]
          .filter(Boolean)
          .join(" · ");
      });
  }

  function bindGalleryButton(button, host, photos, api) {
    if (!button) {
      return;
    }
    button.hidden = photos.length < 2;
    if (button.dataset.galleryBound === "true") {
      button._galleryHost = host;
      return;
    }
    button.dataset.galleryBound = "true";
    button.addEventListener("click", function () {
      var card = button._galleryHost || host;
      gallery.photos = (card && card._mediaPhotos) || photos;
      gallery.api = api;
      var current = card && card.querySelector("[data-media-id].is-current");
      var start = 0;
      if (current) {
        var id = current.getAttribute("data-media-id");
        gallery.photos.forEach(function (row, i) {
          if (row.mediaId === id) {
            start = i;
          }
        });
      }
      showGalleryAt(start);
    });
    button._galleryHost = host;
  }

  function showPhoto(host, mediaId, role) {
    var api = root.media;
    var img = host.querySelector(".media-photo-main");
    var placeholder = host.querySelector(".media-photo-placeholder");
    var caption = host.querySelector(".media-photo-caption");
    if (!api || !img) {
      return Promise.resolve();
    }
    return api.blob(mediaId, role || "display").catch(function () {
      return api.blob(mediaId, "original");
    }).then(function (rec) {
      var url = objectUrl(rec, host._mediaUrls);
      img.src = url;
      img.hidden = false;
      if (placeholder) {
        placeholder.hidden = true;
      }
      host.querySelectorAll("[data-media-id]").forEach(function (btn) {
        btn.classList.toggle("is-current", btn.getAttribute("data-media-id") === mediaId);
      });
      var row = host._mediaPhotos && host._mediaPhotos.filter(function (item) {
        return item.mediaId === mediaId;
      })[0];
      if (caption) {
        caption.textContent = row
          ? [row.caption, row.takenAt && String(row.takenAt).slice(0, 10)]
              .filter(Boolean)
              .join(" · ")
          : "";
      }
    }).catch(function () {
      img.hidden = true;
      if (placeholder) {
        placeholder.hidden = false;
      }
    });
  }

  function mount(host, options) {
    options = options || {};
    if (!host) {
      return Promise.resolve();
    }
    unmount(host);
    host._mediaUrls = [];
    var api = root.media;
    var owner = options.owner;
    if (!api || !owner || !owner.id) {
      return Promise.resolve();
    }
    var committedOnly = options.committedOnly !== false;
    return api.list(owner).catch(function () {
      return [];
    }).then(function (rows) {
      rows = rows || [];
      if (committedOnly) {
        rows = rows.filter(function (row) {
          return !row.meta || row.meta.status !== "draft";
        });
      }
      var photos = rows.filter(function (row) {
        return row.mediaClass === "photo";
      });
      var files = rows.filter(function (row) {
        return row.mediaClass === "file";
      });
      host._mediaPhotos = photos;

      var compact = !!options.compact;
      var pickerHref = String(options.pickerHref || "").trim();
      var photoBox = document.createElement("fieldset");
      photoBox.className = "card-static media-photo-card" + (compact ? " is-compact" : "");
      if (options.photoTitle !== "") {
        var photoLegend = document.createElement("legend");
        photoLegend.textContent = options.photoTitle || "Photo";
        photoBox.appendChild(photoLegend);
      }

      var stage = document.createElement("div");
      stage.className = "media-photo-stage";
      if (pickerHref) {
        stage.classList.add("is-clickable");
        stage.setAttribute("role", "link");
        stage.tabIndex = 0;
        stage.title = photos.length ? "Add or edit photos" : "Add photo";
        stage.addEventListener("click", function () {
          window.location.href = pickerHref;
        });
        stage.addEventListener("keydown", function (event) {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            window.location.href = pickerHref;
          }
        });
      }
      var img = document.createElement("img");
      img.className = "media-photo-main";
      img.alt = options.photoTitle || "Photo";
      img.hidden = true;
      var placeholder = document.createElement("div");
      placeholder.className = "media-photo-placeholder";
      placeholder.innerHTML =
        '<span class="fow-photo-placeholder-mark" aria-hidden="true"></span>' +
        "<strong>No photo</strong>" +
        "<span>" +
        (pickerHref ? "Click to add a photo" : "No photo") +
        "</span>";
      stage.appendChild(img);
      stage.appendChild(placeholder);
      photoBox.appendChild(stage);
      if (!compact) {
        var caption = document.createElement("p");
        caption.className = "media-photo-caption section-note";
        photoBox.appendChild(caption);
      }
      var showThumbs =
        !compact && options.thumbs !== false && photos.length > 1;
      var thumbs = null;
      if (showThumbs) {
        thumbs = document.createElement("div");
        thumbs.className = "media-photo-thumbs";
        photoBox.appendChild(thumbs);
      }
      host.appendChild(photoBox);

      if (compact) {
        if (!photos.length) {
          return;
        }
        var primaryCompact = photos.filter(function (row) {
          return row.primary;
        })[0] || photos[0];
        return showPhoto(host, primaryCompact.mediaId, "display");
      }

      bindGalleryButton(options.galleryButton, host, photos, api);
      if (options.galleryWrap) {
        options.galleryWrap.hidden = photos.length < 2;
      }
      paintFileLinks(
        options.filesHost || null,
        files,
        api,
        host._mediaUrls,
        options
      );

      if (!options.filesHost) {
        var fileBox = document.createElement("fieldset");
        fileBox.className = "card-static media-doc-list";
        var fileLegend = document.createElement("legend");
        fileLegend.textContent = options.fileTitle || "Files";
        fileBox.appendChild(fileLegend);
        if (!files.length) {
          if (options.showEmptyFiles === false) {
            fileBox.hidden = true;
          } else {
            var empty = document.createElement("p");
            empty.className = "records-empty";
            empty.textContent = "No files.";
            fileBox.appendChild(empty);
          }
        } else {
          fileBox.appendChild(fileListEl(files, api, host._mediaUrls));
        }
        if (!fileBox.hidden) {
          host.appendChild(fileBox);
        }
      }

      if (!photos.length) {
        return;
      }
      var loads = [];
      if (thumbs) {
        loads = photos.map(function (row) {
          return api.blob(row.mediaId, "thumb").catch(function () {
            return api.blob(row.mediaId, "display");
          }).then(function (rec) {
            var btn = document.createElement("button");
            btn.type = "button";
            btn.setAttribute("data-media-id", row.mediaId);
            btn.title = row.caption || row.originalName || "Photo";
            var thumb = document.createElement("img");
            thumb.alt = "";
            thumb.src = objectUrl(rec, host._mediaUrls);
            btn.appendChild(thumb);
            btn.addEventListener("click", function (event) {
              event.stopPropagation();
              showPhoto(host, row.mediaId, "display");
            });
            thumbs.appendChild(btn);
          }).catch(function () {});
        });
      }
      var primary = photos.filter(function (row) {
        return row.primary;
      })[0] || photos[0];
      return Promise.all(loads).then(function () {
        return showPhoto(host, primary.mediaId, "display");
      });
    });
  }

  root.mediaCard = {
    mount: mount,
    unmount: unmount
  };

  global.addEventListener("pagehide", function () {
    document.querySelectorAll(".media-block").forEach(function (el) {
      unmount(el);
    });
  });
})(typeof window !== "undefined" ? window : globalThis);
