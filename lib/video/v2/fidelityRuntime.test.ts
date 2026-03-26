import assert from "node:assert/strict";
import {
  detectExactEndStateRequired,
  hardenPromptForExactState,
  resolveRuntimeMode,
  selectRuntimeFrames,
  validateRuntimeFidelity,
} from "@/lib/video/v2/fidelityRuntime";
import { resolveRuntimeFrameUrls } from "@/lib/video/v2/runs";

void (() => {
  const exact = detectExactEndStateRequired("Model turns to back and shows the back design clearly.");
  assert.equal(exact, true);

  const frames = selectRuntimeFrames({
    motionPrompt: "front to back reveal",
    exactEndStateRequired: true,
    items: [
      { role: "front", generation_id: "front-low", source_kind: "reused_existing", confidence_score: 0.7 },
      { role: "front", generation_id: "front-verified", source_kind: "manual_verified_override", confidence_score: 0.8 },
      { role: "back", generation_id: "back-verified", source_kind: "sku_verified_truth", confidence_score: 1 },
    ],
  });
  assert.equal(frames.startFrameGenerationId, "front-verified");
  assert.equal(frames.endFrameGenerationId, "back-verified");

  assert.equal(
    resolveRuntimeMode({
      requestedMode: "ingredients_to_video",
      exactEndStateRequired: true,
      startFrameGenerationId: "front-verified",
      endFrameGenerationId: "back-verified",
    }),
    "frames_to_video",
  );

  assert.throws(
    () =>
      resolveRuntimeMode({
        requestedMode: "ingredients_to_video",
        exactEndStateRequired: true,
        startFrameGenerationId: "front-verified",
        endFrameGenerationId: null,
      }),
    /require verified start\/end frame anchors/i,
  );

  const hardened = hardenPromptForExactState({ directorPrompt: "Clip goal: reveal back", exactEndStateRequired: true });
  assert.match(hardened, /Runtime fidelity enforcement/i);
  const plain = hardenPromptForExactState({ directorPrompt: "Clip goal: subtle sway", exactEndStateRequired: false });
  assert.equal(plain, "Clip goal: subtle sway");

  validateRuntimeFidelity({
    exactEndStateRequired: true,
    modeSelected: "frames_to_video",
    startFrameGenerationId: "front-verified",
    endFrameGenerationId: "back-verified",
  });
  assert.throws(
    () =>
      validateRuntimeFidelity({
        exactEndStateRequired: true,
        modeSelected: "ingredients_to_video",
        startFrameGenerationId: "front-verified",
        endFrameGenerationId: "back-verified",
      }),
    /must execute in frames_to_video/i,
  );

  const nonExact = selectRuntimeFrames({
    motionPrompt: "subtle breathing portrait",
    exactEndStateRequired: false,
    items: [{ role: "front", generation_id: "front", source_kind: "user_uploaded", confidence_score: 0.8 }],
  });
  assert.equal(nonExact.startFrameGenerationId, "front");
  assert.equal(nonExact.endFrameGenerationId, null);

  const urls = resolveRuntimeFrameUrls({
    pack: {
      id: "pack-1",
      pack_name: "pack",
      pack_type: "hybrid",
      status: "ready",
      notes: null,
      aggregate_stability_score: 0.9,
      is_ready: true,
      created_at: "",
      updated_at: "",
      anchor_pack_items: [
        {
          id: "a",
          anchor_pack_id: "pack-1",
          generation_id: "front-verified",
          role: "front",
          sort_order: 0,
          camera_signature: null,
          lighting_signature: null,
          pose_signature: null,
          garment_signature: null,
          scene_signature: null,
          stability_score: 1,
          notes: null,
          generation: { id: "front-verified", prompt: null, asset_url: "https://x/front.jpg", url: null, generation_kind: "image" },
        },
        {
          id: "b",
          anchor_pack_id: "pack-1",
          generation_id: "back-verified",
          role: "back",
          sort_order: 1,
          camera_signature: null,
          lighting_signature: null,
          pose_signature: null,
          garment_signature: null,
          scene_signature: null,
          stability_score: 1,
          notes: null,
          generation: { id: "back-verified", prompt: null, asset_url: "https://x/back.jpg", url: null, generation_kind: "image" },
        },
      ],
    },
    startFrameGenerationId: "front-verified",
    endFrameGenerationId: "back-verified",
    startFrameRole: "front",
    endFrameRole: "back",
  });
  assert.equal(urls.startFrameUrl, "https://x/front.jpg");
  assert.equal(urls.endFrameUrl, "https://x/back.jpg");
})();
