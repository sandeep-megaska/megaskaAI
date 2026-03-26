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
  const tier1Direct = buildTransitionPlan({
    clipIntentId: "clip-tier1",
    motionPrompt: "subtle pivot front to three quarter",
    garmentRisk: "low",
    allowDirectFrontBack: true,
    requestedStart: "front",
    requestedEnd: "three_quarter_left",
    motionComplexity: "low",
    items: [
      item({ id: "a", role: "front", generation_id: "front-1" }),
      item({ id: "b", role: "three_quarter_left", generation_id: "q-1" }),
      item({ id: "fit", role: "fit_anchor", generation_id: "fit-1" }),
    ],
  });
  assert.equal(tier1Direct.strategy, "direct");

  const tier3Segmented = buildTransitionPlan({
    clipIntentId: "clip-tier3",
    motionPrompt: "modest layered frock front to back reveal",
    garmentRisk: "high",
    allowDirectFrontBack: false,
    requestedStart: "front",
    requestedEnd: "back",
    motionComplexity: "medium",
    requestedDurationSeconds: 8,
    items: [
      item({ id: "a", role: "front", generation_id: "front-1" }),
      item({ id: "b", role: "three_quarter_left", generation_id: "q-1" }),
      item({ id: "c", role: "mid_turn_left", generation_id: "mid-1" }),
      item({ id: "d", role: "back", generation_id: "back-1" }),
      item({ id: "fit", role: "fit_anchor", generation_id: "fit-1" }),
    ],
  });
  assert.equal(tier3Segmented.strategy, "segmented");
  assert.ok(tier3Segmented.segments.length >= 2);

  const blockedMissingBack = buildTransitionPlan({
    clipIntentId: "clip-block",
    motionPrompt: "modest frock front to back reveal",
    garmentRisk: "high",
    allowDirectFrontBack: false,
    requestedStart: "front",
    requestedEnd: "back",
    motionComplexity: "medium",
    items: [
      item({ id: "a", role: "front", generation_id: "front-1" }),
      item({ id: "b", role: "three_quarter_left", generation_id: "q-1" }),
      item({ id: "fit", role: "fit_anchor", generation_id: "fit-1" }),
    ],
  });
  assert.equal(blockedMissingBack.strategy, "blocked_missing_intermediate");
  assert.ok(blockedMissingBack.compiled_video_plan.blocked_reasons.some((reason) => reason.includes("back")));

  const forcedEightSeconds = buildTransitionPlan({
    clipIntentId: "clip-duration",
    motionPrompt: "validation pass with exact start/end frames",
    garmentRisk: "low",
    allowDirectFrontBack: true,
    requestedStart: "start_frame",
    requestedEnd: "end_frame",
    startEndFrameMode: true,
    validationMode: true,
    requestedDurationSeconds: 4,
    items: [
      item({ id: "s", role: "start_frame", generation_id: "start-1" }),
      item({ id: "e", role: "end_frame", generation_id: "end-1" }),
    ],
  });
  assert.equal(forcedEightSeconds.compiled_video_plan.total_duration_seconds, 8);

  const compiledSegments = compileTransitionSegments(tier3Segmented);
  assert.ok(compiledSegments[0].director_prompt.includes("no silhouette collapse"));
  assert.ok(compiledSegments[0].director_prompt.includes("no bikini conversion"));
})();
