"use strict";

var { test, expect } = require("@playwright/test");

test.describe("loopback static server harness", function () {
  test("serves index.html over 127.0.0.1", async function ({ request }) {
    var response = await request.get("/index.html");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"] || "").toMatch(/html/);
    var body = await response.text();
    expect(body).toMatch(/<!DOCTYPE html>/i);
  });

  test("does not serve .git", async function ({ request }) {
    var response = await request.get("/.git/HEAD");
    expect([400, 403, 404]).toContain(response.status());
  });
});
