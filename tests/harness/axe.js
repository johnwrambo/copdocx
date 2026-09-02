"use strict";

var axePlaywright = require("@axe-core/playwright");
var AxeBuilder = axePlaywright.default || axePlaywright.AxeBuilder || axePlaywright;

function createAxeBuilder(page) {
  return new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
}

async function scanPage(page, options) {
  var builder = createAxeBuilder(page);
  if (options && options.exclude) {
    options.exclude.forEach(function (selector) {
      builder.exclude(selector);
    });
  }
  if (options && options.include) {
    options.include.forEach(function (selector) {
      builder.include(selector);
    });
  }
  return builder.analyze();
}

module.exports = {
  createAxeBuilder: createAxeBuilder,
  scanPage: scanPage
};
