import test from "node:test";
import assert from "node:assert/strict";

import {
  isRetiredVeoModelId,
  resolveVeoModelCandidates,
  RETIRED_VEO_MODEL_IDS,
  VEO_GEMINI_API_MODELS,
} from "../lib/ai/veoModels.ts";

test("retired Gemini API model ids are recognised", () => {
  assert.equal(isRetiredVeoModelId("veo-2.0-generate-001"), true);
  assert.equal(isRetiredVeoModelId("veo-3.0-generate-001"), true);
  assert.equal(isRetiredVeoModelId("veo-3.0-fast-generate-001"), true);
  assert.equal(isRetiredVeoModelId(VEO_GEMINI_API_MODELS.standard), false);
  assert.equal(isRetiredVeoModelId(VEO_GEMINI_API_MODELS.fast), false);
});

test("retired model ids re-route to a live model as the first candidate", () => {
  for (const retired of Object.keys(RETIRED_VEO_MODEL_IDS)) {
    const first = resolveVeoModelCandidates(retired)[0];
    assert.equal(isRetiredVeoModelId(first), false, `${retired} still resolves to retired ${first}`);
  }

  assert.equal(resolveVeoModelCandidates("veo-2.0-generate-001")[0], VEO_GEMINI_API_MODELS.standard);
  assert.equal(resolveVeoModelCandidates("veo-3.0-fast-generate-001")[0], VEO_GEMINI_API_MODELS.fast);
});

test("preview and GA spellings fall back to each other", () => {
  assert.deepEqual(resolveVeoModelCandidates("veo-3.1-generate-preview"), [
    "veo-3.1-generate-preview",
    "veo-3.1-generate-001",
  ]);
  assert.deepEqual(resolveVeoModelCandidates("veo-3.1-generate-001"), [
    "veo-3.1-generate-001",
    "veo-3.1-generate-preview",
  ]);
  assert.deepEqual(resolveVeoModelCandidates("veo-3.1-fast-generate-preview"), [
    "veo-3.1-fast-generate-preview",
    "veo-3.1-fast-generate-001",
  ]);
});

test("an unknown model id still has a live fallback candidate", () => {
  const candidates = resolveVeoModelCandidates("veo-9.9-generate-001");
  assert.equal(candidates[0], "veo-9.9-generate-001");
  assert.equal(candidates.at(-1), VEO_GEMINI_API_MODELS.standard);
});

test("candidate resolution never returns an empty list", () => {
  for (const model of ["", "   ", VEO_GEMINI_API_MODELS.standard, "veo-2.0-generate-001", "something-else"]) {
    assert.ok(resolveVeoModelCandidates(model).length > 0, `empty candidates for '${model}'`);
  }
});
