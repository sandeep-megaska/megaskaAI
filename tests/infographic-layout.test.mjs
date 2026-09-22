import test from "node:test";
import assert from "node:assert/strict";
import { normalizeFeatureLabel, splitFeatureLabel } from "../lib/infographic/layout.ts";

test("normalizes infographic feature labels", () => {
  assert.equal(normalizeFeatureLabel("  Easy   full-zip closure ", "Fallback"), "EASY FULL-ZIP CLOSURE");
  assert.equal(normalizeFeatureLabel("", "Secure fit"), "SECURE FIT");
});

test("wraps feature labels without losing words", () => {
  assert.deepEqual(splitFeatureLabel("EASY FULL ZIP CLOSURE", 12), ["EASY FULL", "ZIP CLOSURE"]);
});

test("caps feature labels for safe marketplace layouts", () => {
  assert.equal(normalizeFeatureLabel("x".repeat(80), "fallback").length, 48);
});
