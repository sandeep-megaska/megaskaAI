import test from "node:test";
import assert from "node:assert/strict";

import { buildCompileTraceabilitySnapshot } from "../lib/video/v2/compileTraceability.ts";
import { buildCanonicalRunSnapshot, resolvePersistedRunPrompt } from "../lib/video/v2/promptPropagation.ts";
import { excerpt, resolveRunPrompt } from "../app/studio/video/v2/components/helpers.ts";

test("compile snapshot carries canonical director_prompt", () => {
  const snapshot = buildCompileTraceabilitySnapshot({
    clipIntentId: "clip-1",
    workingPackId: "pack-1",
    sourceProfileId: "profile-1",
    compiledAnchorPackId: "anchor-1",
    workingPackReadinessScore: 0.82,
    directorPrompt: "Keep garment details stable while model pivots.",
    fallbackPrompt: "Stable motion.",
    modeSelected: "frames_to_video",
    providerSelected: "veo-3.1",
    modelSelected: "veo-3.1",
    anchorCount: 3,
    fidelityPlan: {
      decision: "proceed",
      reasons: ["anchors look stable"],
      warnings: [],
      recommendedMode: "frames_to_video",
    },
  });

  assert.equal(snapshot.director_prompt, "Keep garment details stable while model pivots.");
  assert.equal(snapshot.mode_selected, "frames_to_video");
  assert.equal(snapshot.provider_selected, "veo-3.1");
});

test("execution snapshot consumes compiled prompt and preserves mode/provider traceability", () => {
  const snapshot = buildCanonicalRunSnapshot({
    requestPayloadSnapshot: { existing: true },
    directorPrompt: "Slow turn with camera locked.",
    fallbackPrompt: "Stable clip",
    modeSelected: "frames_to_video",
    providerSelected: "veo-3.1",
    modelSelected: "veo-3.1",
    anchorCount: 4,
  });

  assert.equal(snapshot.director_prompt, "Slow turn with camera locked.");
  assert.equal(snapshot.mode_selected, "frames_to_video");
  assert.equal(snapshot.provider_selected, "veo-3.1");
  assert.equal(snapshot.anchor_count, 4);
});

test("missing prompt fails fast before provider call", () => {
  assert.throws(
    () =>
      buildCanonicalRunSnapshot({
        requestPayloadSnapshot: {},
        directorPrompt: "   ",
        fallbackPrompt: null,
        modeSelected: "frames_to_video",
        providerSelected: "veo-3.1",
        modelSelected: "veo-3.1",
      }),
    /compiled prompt is missing/,
  );
});

test("run persistence prompt resolution prefers stored request snapshot", () => {
  const prompt = resolvePersistedRunPrompt({
    requestPayloadSnapshot: { director_prompt: "Snapshot prompt" },
    runMeta: { prompt_used: "Meta prompt" },
    planDirectorPrompt: "Plan prompt",
  });

  assert.equal(prompt, "Snapshot prompt");
});

test("UI helper resolves stored prompt and avoids fallback message path", () => {
  const prompt = resolveRunPrompt({
    request_payload_snapshot: { director_prompt: "Persisted run prompt" },
    run_meta: {},
  });

  assert.equal(prompt, "Persisted run prompt");
});

test("valid run prompt does not render No prompt captured", () => {
  const prompt = resolveRunPrompt({
    request_payload_snapshot: { director_prompt: "Track subject with subtle motion" },
    run_meta: {},
  });

  assert.notEqual(excerpt(prompt, 80), "No prompt captured.");
});
