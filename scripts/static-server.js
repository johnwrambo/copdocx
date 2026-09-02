"use strict";

var fs = require("fs");
var http = require("http");
var path = require("path");
var paths = require("./lib/paths");

var LOOPBACK_HOSTS = {
  "127.0.0.1": true,
  localhost: true,
  "::1": true
};

var MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

var BLOCKED_SEGMENTS = {
  ".git": true,
  node_modules: true,
  dist: true,
  "playwright-report": true,
  "test-results": true
};

function assertLoopbackHost(host) {
  if (!LOOPBACK_HOSTS[host]) {
    throw new Error("static test server is loopback-only; refused host " + host);
  }
}

function requestPath(requestUrl) {
  var raw = String(requestUrl || "/");
  var query = raw.indexOf("?");
  if (query !== -1) {
    raw = raw.slice(0, query);
  }
  return raw;
}

function decodePathSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch (error) {
    return null;
  }
}

function safeResolve(root, requestUrl) {
  var raw = requestPath(requestUrl);
  if (raw.indexOf("\\") !== -1 || raw.indexOf("\0") !== -1) {
    return { status: 400, error: "bad path" };
  }
  var rel = raw.replace(/^\/+/, "");
  if (!rel) {
    rel = "index.html";
  }
  var encodedParts = rel.split("/");
  var parts = [];
  for (var i = 0; i < encodedParts.length; i += 1) {
    var decoded = decodePathSegment(encodedParts[i]);
    if (decoded === null) {
      return { status: 400, error: "bad encoding" };
    }
    if (
      decoded === "" ||
      decoded === "." ||
      decoded === ".." ||
      decoded.indexOf("/") !== -1 ||
      decoded.indexOf("\\") !== -1 ||
      decoded.indexOf("\0") !== -1 ||
      BLOCKED_SEGMENTS[decoded]
    ) {
      return { status: 403, error: "forbidden" };
    }
    parts.push(decoded);
  }
  var posixRel = parts.join("/");
  var abs = path.normalize(path.join(root, parts.join(path.sep)));
  var rootResolved = path.resolve(root);
  var rootPrefix = rootResolved.endsWith(path.sep) ? rootResolved : rootResolved + path.sep;
  if (abs !== rootResolved && abs.indexOf(rootPrefix) !== 0) {
    return { status: 403, error: "forbidden" };
  }
  return { abs: abs, rel: posixRel };
}

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  res.end(body);
}

function createStaticServer(options) {
  options = options || {};
  var host = options.host || "127.0.0.1";
  assertLoopbackHost(host);
  var root = path.resolve(options.root || paths.ROOT);
  var server = http.createServer(function (req, res) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      send(res, 405, { "Content-Type": "text/plain; charset=utf-8", Allow: "GET, HEAD" }, "Method Not Allowed\n");
      return;
    }
    var resolved = safeResolve(root, req.url || "/");
    if (resolved.status) {
      send(res, resolved.status, { "Content-Type": "text/plain; charset=utf-8" }, resolved.error + "\n");
      return;
    }
    fs.stat(resolved.abs, function (err, stat) {
      if (err || !stat.isFile()) {
        send(res, 404, { "Content-Type": "text/plain; charset=utf-8" }, "Not Found\n");
        return;
      }
      var ext = path.extname(resolved.abs).toLowerCase();
      var headers = {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Content-Length": String(stat.size),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      };
      if (req.method === "HEAD") {
        send(res, 200, headers, "");
        return;
      }
      var stream = fs.createReadStream(resolved.abs);
      res.writeHead(200, headers);
      stream.on("error", function () {
        if (!res.headersSent) {
          send(res, 500, { "Content-Type": "text/plain; charset=utf-8" }, "Read error\n");
        } else {
          res.destroy();
        }
      });
      stream.pipe(res);
    });
  });

  function listen(port) {
    return new Promise(function (resolve, reject) {
      server.once("error", reject);
      server.listen(port || 0, host, function () {
        server.removeListener("error", reject);
        var address = server.address();
        resolve({
          server: server,
          host: host,
          port: address.port,
          url: "http://" + (host === "::1" ? "[::1]" : host) + ":" + address.port + "/"
        });
      });
    });
  }

  function close() {
    return new Promise(function (resolve, reject) {
      server.close(function (err) {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  return { server: server, listen: listen, close: close, host: host, root: root };
}

function parseArgs(argv) {
  var port = Number(process.env.PORT || 4173);
  var host = process.env.HOST || "127.0.0.1";
  var args = argv.slice(2);
  for (var i = 0; i < args.length; i += 1) {
    if (args[i] === "--port" && args[i + 1]) {
      port = Number(args[i + 1]);
      i += 1;
    } else if (args[i] === "--host" && args[i + 1]) {
      host = args[i + 1];
      i += 1;
    }
  }
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("invalid port");
  }
  return { port: port, host: host };
}

async function main() {
  var opts = parseArgs(process.argv);
  var created = createStaticServer({ host: opts.host, root: paths.ROOT });
  var info = await created.listen(opts.port);
  console.log("loopback static server " + info.url);
}

module.exports = {
  createStaticServer: createStaticServer,
  safeResolve: safeResolve,
  assertLoopbackHost: assertLoopbackHost
};

if (require.main === module) {
  main().catch(function (error) {
    console.error(error && error.message ? error.message : error);
    process.exit(1);
  });
}
