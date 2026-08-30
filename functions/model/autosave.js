/**
 * Shared draft autosave: focusout/change → quiet saveDraft.
 * Caller owns validation, commit, and signature remember-on-success.
 */
(function (global) {
  "use strict";

  var root = (global.COPDoc = global.COPDoc || {});
  var model = (root.model = root.model || {});
  var sessions = {};

  function bind(opts) {
    opts = opts || {};
    var key = opts.key || "default";
    if (sessions[key]) {
      return sessions[key];
    }
    var last = "";
    function signature() {
      return typeof opts.signature === "function" ? opts.signature() : "";
    }
    function remember() {
      last = signature();
    }
    function request() {
      if (opts.suppressed && opts.suppressed()) {
        return;
      }
      window.setTimeout(function () {
        if (opts.suppressed && opts.suppressed()) {
          return;
        }
        if (signature() === last) {
          return;
        }
        if (typeof opts.saveDraft === "function") {
          opts.saveDraft();
        }
      }, 0);
    }
    function isField(el) {
      if (typeof opts.isField === "function") {
        return opts.isField(el);
      }
      return false;
    }
    document.addEventListener(
      "focusout",
      function (event) {
        if (isField(event.target)) {
          request();
        }
      },
      true
    );
    document.addEventListener("change", function (event) {
      if (isField(event.target)) {
        request();
      }
    });
    var api = { remember: remember, request: request };
    sessions[key] = api;
    return api;
  }

  model.autosave = {
    bind: bind
  };
})(typeof window !== "undefined" ? window : globalThis);
