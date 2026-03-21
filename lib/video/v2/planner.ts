import { routeVideoMode } from "@/lib/video/v2/modeRouter";
import {
  type AnchorPack,
  type AnchorPackItemRole,
  type AnchorRiskLevel,
  type DirectorPlanContract,
  type DirectorPlannerInput,
  type MotionComplexity,
} from "@/lib/video/v2/types";

const DEFAULT_NEGATIVE_CONSTRAINTS = [
  "Do not change facial geometry or ethnicity cues.",
  "Do not alter garment cut, print alignment, or logo placement.",
  "Do not introduce large camera jumps or scene swaps.",
];

function classifyMotionComplexity(motionRequest: string): MotionComplexity {
  const normalized = motionRequest.toLowerCase();
  if (/run|jump|spin|dance|crowd|vehicle|explosion/.test(normalized)) return "high";
  if (/turn|walk|step|pivot|reach|pose/.test(normalized)) return "medium";
  return "low";
}

function deriveAnchorRisk(packs: AnchorPack[], motionComplexity: MotionComplexity): AnchorRiskLevel {
  const bestStability = packs.reduce((max, pack) => Math.max(max, Number(pack.aggregate_stability_score ?? 0)), 0);
  if (motionComplexity === "high" && bestStability < 0.75) return "high";
  if (motionComplexity === "medium" && bestStability < 0.65) return "medium";
  if (bestStability < 0.45) return "high";
  return "low";
}

function deriveRequiredRoles(mode: DirectorPlanContract["mode_selected"]): AnchorPackItemRole[] {
  if (mode === "frames_to_video") return ["start_frame", "end_frame", "fit_anchor"];
  if (mode === "scene_extension") return ["start_frame", "context"];
  return ["front", "three_quarter_left", "three_quarter_right", "fit_anchor", "detail"];
}

function buildDirectorPrompt(input: DirectorPlannerInput, mode: DirectorPlanContract["mode_selected"]) {
  return [
    `Motion request: ${input.motionRequest.trim()}`,
    `Mode: ${mode}`,
    "Priority: preserve model identity and garment fidelity over novelty.",
    "Use anchor-guided transitions with small controlled motion and stable framing.",
  ].join("\n");
}

export function buildDirectorPlan(input: DirectorPlannerInput): DirectorPlanContract {
  const motionComplexity = classifyMotionComplexity(input.motionRequest);
  const availablePackTypes = Array.from(new Set(input.packs.map((pack) => pack.pack_type)));
  const availableRoles = Array.from(new Set(input.packs.flatMap((pack) => pack.anchor_pack_items?.map((item) => item.role) ?? [])));
  const topPacks = [...input.packs]
    .sort((a, b) => Number(b.aggregate_stability_score ?? 0) - Number(a.aggregate_stability_score ?? 0))
    .slice(0, 3);
  const stabilityScore = topPacks.length
    ? topPacks.reduce((sum, pack) => sum + Number(pack.aggregate_stability_score ?? 0), 0) / topPacks.length
    : 0;

  const routed = routeVideoMode({
    availablePackTypes,
    availableRoles,
    packStabilityScore: stabilityScore,
    motionComplexity,
    exactEndStateRequired: input.exactEndStateRequired,
    priorValidatedClipExists: input.priorValidatedClipExists,
  });

  const anchorRisk = deriveAnchorRisk(topPacks, motionComplexity);
  const requiredRoles = deriveRequiredRoles(routed.modeSelected);
  const recommendedPackIds = topPacks.map((pack) => pack.id);

  return {
    mode_selected: routed.modeSelected,
    why_mode_selected: routed.whyModeSelected,
    recommended_pack_ids: recommendedPackIds,
    required_reference_roles: requiredRoles,
    duration_seconds: input.durationSeconds,
    aspect_ratio: input.aspectRatio,
    motion_complexity: motionComplexity,
    anchor_risk_level: anchorRisk,
    director_prompt: buildDirectorPrompt(input, routed.modeSelected),
    fallback_prompt: "Keep pose change minimal. Preserve identity, garment drape, and scene continuity.",
    negative_constraints: DEFAULT_NEGATIVE_CONSTRAINTS,
    provider_order: input.preferredProviders?.length ? input.preferredProviders : ["veo-2", "veo-3-fast"],
  };
}
