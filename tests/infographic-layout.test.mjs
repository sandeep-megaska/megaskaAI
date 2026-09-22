import test from "node:test";
import assert from "node:assert/strict";
import {
  MARKETPLACE_PRESETS,
  clampCanvasDimension,
  normalizeFeatureLabel,
  splitFeatureLabel,
} from "../lib/infographic/layout.ts";

test("normalizes whitespace while preserving editor casing", () => {
  assert.equal(normalizeFeatureLabel("  Easy   full-zip closure ", "Fallback"), "Easy full-zip closure");
  assert.equal(normalizeFeatureLabel("", "Secure fit"), "Secure fit");
});

test("wraps feature labels without losing words", () => {
  assert.deepEqual(splitFeatureLabel("EASY FULL ZIP CLOSURE", 12), ["EASY FULL", "ZIP CLOSURE"]);
});

test("caps feature labels for safe layouts", () => {
  assert.equal(normalizeFeatureLabel("x".repeat(80), "fallback").length, 64);
});

test("clamps custom canvas dimensions", () => {
  assert.equal(clampCanvasDimension(100), 500);
  assert.equal(clampCanvasDimension(9000), 5000);
  assert.equal(clampCanvasDimension(1600), 1600);
});

test("ships marketplace working presets without presenting them as policy guarantees", () => {
  assert.ok(MARKETPLACE_PRESETS.some((preset) => preset.id === "amazon-square"));
  assert.ok(MARKETPLACE_PRESETS.some((preset) => preset.id === "myntra-portrait"));
  assert.ok(MARKETPLACE_PRESETS.some((preset) => preset.id === "shopify-portrait"));
});
