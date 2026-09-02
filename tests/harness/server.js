"use strict";

var staticServer = require("../../scripts/static-server");

function startLoopbackServer(options) {
  return staticServer.createStaticServer(options || { host: "127.0.0.1" });
}

module.exports = {
  startLoopbackServer: startLoopbackServer,
  createStaticServer: staticServer.createStaticServer
};
