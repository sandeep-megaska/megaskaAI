import test from "node:test";
import assert from "node:assert/strict";

import { assessFidelity, MAX_REFERENCE_IMAGES, planConditioning } from "../lib/video/veo/conditioning.ts";
import { buildVeoRequest } from "../lib/video/veo/generate.ts";

const front = { url: "https://cdn.example/front.png", role: "front" };
const back = { url: "https://cdn.example/back.png", role: "back" };
const side = { url: "https://cdn.example/side.png", role: "left_profile" };
const detail = { url: "https://cdn.example/detail.png", role: "detail" };
const extra = { url: "https://cdn.example/extra.png", role: "context" };

/* ---------------------------------------------------------------------------
 * The provider treats reference images as mutually exclusive with frame
 * conditioning. These are the tests that hold that line.
 * ------------------------------------------------------------------------ */

test("frames and reference images are never sent together", () => {
  for (const input of [
    { startFrame: front, endFrame: back, references: [side, detail] },
    { startFrame: front, references: [side] },
    { endFrame: back, references: [side] },
  ]) {
    const plan = planConditioning(input);
    const hasFrames = Boolean(plan.startFrame || plan.endFrame);
    const hasReferences = plan.references.length > 0;
    assert.ok(!(hasFrames && hasReferences), `mode ${plan.mode} mixed frames with references`);
  }
});

test("a start and end frame interpolate, and the references are reported as dropped", () => {
  const plan = planConditioning({ startFrame: front, endFrame: back, references: [side] });
  assert.equal(plan.mode, "interpolate");
  assert.equal(plan.startFrame?.url, front.url);
  assert.equal(plan.endFrame?.url, back.url);
  assert.deepEqual(plan.references, []);
  assert.equal(plan.dropped.length, 1);
  assert.match(plan.dropped[0].reason, /does not accept reference images/i);
});

test("references win when there is no endpoint pair", () => {
  const plan = planConditioning({ startFrame: front, references: [side, detail] });
  assert.equal(plan.mode, "references");
  assert.equal(plan.startFrame, null);
  assert.equal(plan.references.length, 2);
  assert.equal(plan.dropped.length, 1);
});

test("a lone start frame animates forward", () => {
  const plan = planConditioning({ startFrame: front });
  assert.equal(plan.mode, "first-frame");
  assert.equal(plan.startFrame?.url, front.url);
  assert.equal(plan.endFrame, null);
});

test("a lone end frame becomes the opening frame rather than being discarded", () => {
  const plan = planConditioning({ endFrame: back });
  assert.equal(plan.mode, "first-frame");
  assert.equal(plan.startFrame?.url, back.url);
});

test("no imagery falls back to text", () => {
  assert.equal(planConditioning({}).mode, "text");
});

test("references are capped at the provider limit and the overflow is reported", () => {
  const plan = planConditioning({ references: [front, back, side, detail, extra] });
  assert.equal(plan.mode, "references");
  assert.equal(plan.references.length, MAX_REFERENCE_IMAGES);
  assert.equal(plan.dropped.length, 2);
  assert.match(plan.dropped[0].reason, /at most 3/i);
});

test("duplicate urls are not sent twice", () => {
  const plan = planConditioning({ startFrame: front, references: [front, side] });
  assert.equal(plan.references.length, 1);
  assert.equal(plan.references[0].url, side.url);
});

test("an explicit reference-mode preference overrides the frame pair", () => {
  const plan = planConditioning({ startFrame: front, endFrame: back, references: [side], preferred: "references" });
  assert.equal(plan.mode, "references");
  assert.equal(plan.startFrame, null);
  assert.equal(plan.endFrame, null);
  assert.equal(plan.dropped.length, 2);
});

test("preferring references with none available still yields a valid plan", () => {
  const plan = planConditioning({ startFrame: front, endFrame: back, preferred: "references" });
  assert.equal(plan.mode, "interpolate");
});

test("blank urls are ignored", () => {
  const plan = planConditioning({ startFrame: { url: "   " }, references: [{ url: "" }] });
  assert.equal(plan.mode, "text");
});

/* ---------------------------------------------------------------------------
 * The request the provider actually receives.
 * ------------------------------------------------------------------------ */

async function buildRequest(plan) {
  // buildVeoRequest inlines image bytes, so point it at a data: URL loader-free
  // path by stubbing fetch for the duration of the call.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { "content-type": "image/png" } });
  try {
    return await buildVeoRequest({ model: "veo-3.1-generate-preview", prompt: "turn", plan });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("the interpolate request carries both frames and no references", async () => {
  const plan = planConditioning({ startFrame: front, endFrame: back, references: [side] });
  const { source, config } = await buildRequest(plan);
  assert.ok(source.image, "expected a first frame");
  assert.ok(config.lastFrame, "expected a last frame");
  assert.equal(config.referenceImages, undefined);
});

test("the references request carries no frames", async () => {
  const plan = planConditioning({ references: [front, back] });
  const { source, config } = await buildRequest(plan);
  assert.equal(source.image, undefined);
  assert.equal(config.lastFrame, undefined);
  assert.equal(config.referenceImages.length, 2);
  assert.equal(config.referenceImages[0].referenceType, "ASSET");
});

test("the text request carries no imagery at all", async () => {
  const { source, config } = await buildRequest(planConditioning({}));
  assert.equal(source.image, undefined);
  assert.equal(config.lastFrame, undefined);
  assert.equal(config.referenceImages, undefined);
});

/* ---------------------------------------------------------------------------
 * Fidelity: how much of the garment the model has to invent.
 * ------------------------------------------------------------------------ */

test("a pinned front-to-back turn is the low-risk path but flags the long arc", () => {
  const plan = planConditioning({ startFrame: front, endFrame: back });
  const fidelity = assessFidelity(plan, { turnIntent: true });
  assert.equal(fidelity.uncoveredDegrees, 180);
  assert.equal(fidelity.risk, "medium");
  assert.match(fidelity.nextBestAction, /split/i);
});

test("a short pinned turn is low risk with nothing left to do", () => {
  const plan = planConditioning({ startFrame: front, endFrame: side });
  const fidelity = assessFidelity(plan, { turnIntent: true });
  assert.equal(fidelity.uncoveredDegrees, 90);
  assert.equal(fidelity.risk, "low");
  assert.equal(fidelity.nextBestAction, null);
});

test("turning with only a start frame is high risk and asks for the back view", () => {
  const fidelity = assessFidelity(planConditioning({ startFrame: front }), { turnIntent: true });
  assert.equal(fidelity.risk, "high");
  assert.match(fidelity.nextBestAction, /back view/i);
});

test("references without a back view are high risk for a turn", () => {
  const fidelity = assessFidelity(planConditioning({ references: [front, side] }), { turnIntent: true });
  assert.equal(fidelity.risk, "high");
  assert.match(fidelity.nextBestAction, /back view/i);
});

test("references including a back view drop to medium and suggest pinning", () => {
  const fidelity = assessFidelity(planConditioning({ references: [front, back] }), { turnIntent: true });
  assert.equal(fidelity.risk, "medium");
  assert.match(fidelity.nextBestAction, /end frame/i);
});

test("a text-only clip is always high risk", () => {
  const fidelity = assessFidelity(planConditioning({}), { turnIntent: false });
  assert.equal(fidelity.risk, "high");
});
