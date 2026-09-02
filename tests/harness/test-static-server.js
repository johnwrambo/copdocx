"use strict";

var assert = require("node:assert/strict");
var http = require("http");
var net = require("net");
var staticServer = require("../../scripts/static-server");

function get(url) {
  return new Promise(function (resolve, reject) {
    http
      .get(url, function (res) {
        var chunks = [];
        res.on("data", function (chunk) {
          chunks.push(chunk);
        });
        res.on("end", function () {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8")
          });
        });
      })
      .on("error", reject);
  });
}

function rawGet(port, urlPath) {
  return new Promise(function (resolve, reject) {
    var sock = net.connect(port, "127.0.0.1", function () {
      sock.write(
        "GET " + urlPath + " HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n"
      );
    });
    var chunks = [];
    sock.on("data", function (chunk) {
      chunks.push(chunk);
    });
    sock.on("error", reject);
    sock.on("end", function () {
      var text = Buffer.concat(chunks).toString("utf8");
      var match = text.match(/^HTTP\/1\.[01] (\d+)/);
      resolve({
        status: match ? Number(match[1]) : 0,
        body: text
      });
    });
  });
}

async function main() {
  assert.throws(function () {
    staticServer.assertLoopbackHost("0.0.0.0");
  }, /loopback-only/);
  assert.throws(function () {
    staticServer.createStaticServer({ host: "0.0.0.0" });
  }, /loopback-only/);

  var traversal = staticServer.safeResolve(process.cwd(), "/../../.gitignore");
  assert.equal(traversal.status, 403);
  var encodedTraversal = staticServer.safeResolve(process.cwd(), "/%2e%2e/%2e%2e/.gitignore");
  assert.equal(encodedTraversal.status, 403);

  var created = staticServer.createStaticServer({ host: "127.0.0.1" });
  var info = await created.listen(0);
  assert.equal(info.host, "127.0.0.1");
  try {
    var index = await get(info.url + "index.html");
    assert.equal(index.status, 200);
    assert.match(index.headers["content-type"], /html/);
    assert.match(index.body, /<!DOCTYPE html>/i);

    var blocked = await rawGet(info.port, "/../../.gitignore");
    assert.ok(blocked.status === 403 || blocked.status === 400);

    var encoded = await rawGet(info.port, "/%2e%2e/%2e%2e/.gitignore");
    assert.ok(encoded.status === 403 || encoded.status === 400);

    var git = await get(info.url + ".git/HEAD");
    assert.ok(git.status === 403 || git.status === 404);
  } finally {
    await created.close();
  }
  console.log("ok static-server harness");
}

main().catch(function (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
