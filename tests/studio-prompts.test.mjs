import test from "node:test";
import assert from "node:assert/strict";

import { buildMoreViewsPrompt } from "../lib/studio/prompts.ts";
import { resolveTarget } from "../app/api/assets/download/route.ts";

/* ---------------------------------------------------------------------------
 * "More views" must reproduce the whole photograph, not just the product.
 *
 * The reported failure: a master shot of a model beside a red Mahindra Thar came
 * back, on "Side View", with a green one. The garment was perfect; the prop was
 * reinvented, because nothing in the prompt pinned it.
 * ------------------------------------------------------------------------ */

test("the scene is pinned by default, down to prop colour", () => {
  const prompt = buildMoreViewsPrompt({ userPrompt: "Camera: side profile view" });
  assert.match(prompt, /Preserve the entire scene/i);
  assert.match(prompt, /props and objects, including their exact colour/i);
  assert.match(prompt, /vehicles: identical make, model, body colour/i);
  assert.match(prompt, /Treat every colour in the frame as fixed/i);
});

test("the scene is no longer described as optional", () => {
  const prompt = buildMoreViewsPrompt({ userPrompt: "side view" });
  // The old prompt offered "or in a new setting" and "background if requested",
  // which is what licensed the model to repaint the scene.
  assert.doesNotMatch(prompt, /or in a new setting/i);
  assert.doesNotMatch(prompt, /background if requested/i);
});

test("a locked scene says only the camera may change", () => {
  const prompt = buildMoreViewsPrompt({ userPrompt: "side view", preserveScene: true });
  assert.match(prompt, /Change only the camera/i);
  assert.match(prompt, /not a new photograph/i);
});

test("unlocking the scene still pins the person and the garment", () => {
  const prompt = buildMoreViewsPrompt({ userPrompt: "New setting: poolside luxury", preserveScene: false });
  assert.match(prompt, /setting may change/i);
  assert.match(prompt, /person and the garment must still match/i);
  assert.match(prompt, /same colorway/i);
  assert.doesNotMatch(prompt, /Preserve the entire scene/i);
});

test("the user's direction is always carried through", () => {
  assert.match(buildMoreViewsPrompt({ userPrompt: "Camera: back view" }), /User direction: Camera: back view/);
});

/* ---------------------------------------------------------------------------
 * The asset proxy must not be usable to read the API key or reach private hosts.
 * ------------------------------------------------------------------------ */

test("an attacker-controlled host is refused", () => {
  for (const url of [
    "https://evil.example/collect",
    "http://generativelanguage.googleapis.com/v1/files",
    "https://169.254.169.254/latest/meta-data/",
    "https://localhost/admin",
    "file:///etc/passwd",
    "not-a-url",
  ]) {
    assert.equal(resolveTarget(url), null, `${url} should be refused`);
  }
});

test("Google asset hosts are allowed and get the key", () => {
  const target = resolveTarget("https://generativelanguage.googleapis.com/v1beta/files/abc:download");
  assert.ok(target);
  assert.equal(target.useGoogleKey, true);
});

test("a lookalike host does not pass the allowlist", () => {
  assert.equal(resolveTarget("https://generativelanguage.googleapis.com.evil.example/x"), null);
});

test("the configured storage host is allowed but never gets the key", (t) => {
  process.env.SUPABASE_URL = "https://abcdefgh.supabase.co";
  t.after(() => {
    delete process.env.SUPABASE_URL;
  });

  const target = resolveTarget("https://abcdefgh.supabase.co/storage/v1/object/public/brand-assets/video/x.mp4");
  assert.ok(target);
  assert.equal(target.useGoogleKey, false);

  assert.equal(resolveTarget("https://other.supabase.co/storage/v1/object/public/x.mp4"), null);
});
