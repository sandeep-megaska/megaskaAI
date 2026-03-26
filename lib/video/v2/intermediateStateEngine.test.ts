import assert from "node:assert/strict";
import { buildTransitionPlan, compileTransitionSegments } from "@/lib/video/v2/intermediateStateEngine";

function item(partial: Partial<{
  id: string;
  role: string;
  generation_id: string | null;
  source_kind: string;
  confidence_score: number;
  sort_order: number;
}> = {}) {
  return {
    id: partial.id ?? Math.random().toString(36).slice(2),
    role: partial.role ?? "front",
    generation_id: partial.generation_id ?? "gen-front",
    source_kind: partial.source_kind ?? "sku_verified_truth",
    confidence_score: partial.confidence_score ?? 0.9,
    sort_order: partial.sort_order ?? 1,
  };
}

void (() => {
  const onlyFrontBackHighRisk = buildTransitionPlan({
    clipIntentId: "clip-1",
    motionPrompt: "modest frock front to back reveal showing exact back design",
    garmentRisk: "high",
    allowDirectFrontBack: false,
    items: [
      item({ id: "a", role: "front", generation_id: "front-1" }),
      item({ id: "b", role: "back", generation_id: "back-1" }),
    ],
  });
  assert.equal(onlyFrontBackHighRisk.strategy, "blocked_missing_intermediate");
  assert.equal(onlyFrontBackHighRisk.intermediate_state_required, true);

  const segmented = buildTransitionPlan({
    clipIntentId: "clip-2",
    motionPrompt: "front to back reveal",
    garmentRisk: "medium",
    allowDirectFrontBack: true,
    items: [
      item({ id: "a", role: "front", generation_id: "front-1" }),
      item({ id: "b", role: "three_quarter_left", generation_id: "mid-1", source_kind: "reused_existing" }),
      item({ id: "c", role: "back", generation_id: "back-1" }),
    ],
  });
  assert.equal(segmented.strategy, "segmented");
  assert.equal(segmented.segments.length, 2);
  assert.deepEqual(
    segmented.segments.map((segment) => `${segment.from_label}->${segment.to_label}`),
    ["front->three_quarter_left", "three_quarter_left->back"],
  );

  const compiledSegments = compileTransitionSegments(segmented);
  assert.equal(compiledSegments.length, 2);
  assert.equal(compiledSegments[0].start_frame_generation_id, "front-1");
  assert.equal(compiledSegments[0].end_frame_generation_id, "mid-1");
  assert.equal(compiledSegments[1].start_frame_generation_id, "mid-1");
  assert.equal(compiledSegments[1].end_frame_generation_id, "back-1");

  const missingIntermediate = buildTransitionPlan({
    clipIntentId: "clip-3",
    motionPrompt: "slow turn to back design",
    garmentRisk: "high",
    allowDirectFrontBack: false,
    items: [
      item({ id: "a", role: "front", generation_id: "front-1" }),
      item({ id: "c", role: "back", generation_id: "back-1" }),
    ],
  });
  assert.equal(missingIntermediate.strategy, "blocked_missing_intermediate");
  assert.ok(missingIntermediate.recommendations[0]?.includes("Image Project"));

  const riskSensitive = buildTransitionPlan({
    clipIntentId: "clip-4",
    motionPrompt: "simple front to back reveal modest layered frock",
    garmentRisk: "low",
    allowDirectFrontBack: true,
    items: [
      item({ id: "a", role: "front", generation_id: "front-1" }),
      item({ id: "c", role: "back", generation_id: "back-1" }),
    ],
  });
  assert.equal(riskSensitive.direct_transition_discouraged, true);

  const simpleFrontOnly = buildTransitionPlan({
    clipIntentId: "clip-5",
    motionPrompt: "subtle breathing portrait, maintain front pose",
    garmentRisk: "low",
    allowDirectFrontBack: true,
    items: [item({ id: "a", role: "front", generation_id: "front-1" })],
  });
  assert.equal(simpleFrontOnly.strategy, "not_applicable");
  assert.equal(simpleFrontOnly.segments.length, 0);
})();
