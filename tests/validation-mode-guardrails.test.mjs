import test from "node:test";
import assert from "node:assert/strict";

import { buildRunConfigSignature, findRecentFailedConfigMatch, normalizeRunMode, shouldWarnHighRiskValidation } from "../lib/video/v2/runMode.ts";
import { resolveRunVideoUrl } from "../app/studio/video/v2/components/helpers.ts";

test("validation mode defaults safely", () => {
  assert.equal(normalizeRunMode(undefined), "validation");
  assert.equal(normalizeRunMode("production"), "production");
});

test("run config signature is deterministic for retry guardrails", () => {
  const input = {
    selectedPackId: "pack-1",
    modeSelected: "frames_to_video",
    providerSelected: "veo-3.1",
    modelSelected: "veo-3.1",
    aspectRatio: "9:16",
    runMode: "validation",
    directorPrompt: "Stable front shot",
    productionMode: "phase1_template",
    phase1TemplateId: "front_still_luxury",
  };
  const first = buildRunConfigSignature(input);
  const second = buildRunConfigSignature(input);
  assert.equal(first, second);
});

test("retry warning detects recent failed identical config", () => {
  const signature = "sig-1";
  const match = findRecentFailedConfigMatch([
    { id: "run-ok", status: "succeeded", created_at: new Date().toISOString(), run_meta: { config_signature: signature } },
    { id: "run-bad", status: "failed", created_at: new Date().toISOString(), run_meta: { config_signature: signature } },
  ], signature, 24);
  assert.equal(match?.id, "run-bad");
});

test("validation mode high-risk warning triggers for non template mode", () => {
  assert.equal(shouldWarnHighRiskValidation({ runMode: "validation", productionMode: "experimental_freeform" }), true);
  assert.equal(shouldWarnHighRiskValidation({ runMode: "production", productionMode: "experimental_freeform" }), false);
});

test("validation runs prefer preview url while production keeps full output", () => {
  const validationUrl = resolveRunVideoUrl({
    run_mode: "validation",
    output_asset_url: "https://cdn.example/full.mp4",
    preview_asset_url: "https://cdn.example/preview.mp4",
  }, { preferValidationPreview: true });
  const productionUrl = resolveRunVideoUrl({
    run_mode: "production",
    output_asset_url: "https://cdn.example/full.mp4",
    preview_asset_url: "https://cdn.example/preview.mp4",
  }, { preferValidationPreview: true });

  assert.equal(validationUrl, "https://cdn.example/preview.mp4");
  assert.equal(productionUrl, "https://cdn.example/full.mp4");
});
