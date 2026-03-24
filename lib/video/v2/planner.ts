import { buildPackReadinessReport } from "@/lib/video/v2/anchorPacks";
import { routeVideoMode } from "@/lib/video/v2/modeRouter";
import {
  type AnchorPackItemRole,
  type AnchorRiskLevel,
  type DirectorPlanContract,
  type DirectorPlannerInput,
  type MotionComplexity,
  type V2Mode,
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

function deriveAnchorRisk(stability: number, motionComplexity: MotionComplexity): AnchorRiskLevel {
  if (motionComplexity === "high" && stability < 0.75) return "high";
  if (motionComplexity === "medium" && stability < 0.65) return "medium";
  if (stability < 0.45) return "high";
  if (stability < 0.7) return "medium";
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

function normalizeDesiredMode(mode?: string): V2Mode | undefined {
  if (mode === "ingredients_to_video" || mode === "frames_to_video" || mode === "scene_extension") return mode;
  return undefined;
}

export function buildDirectorPlan(input: DirectorPlannerInput): DirectorPlanContract {
  const motionComplexity = classifyMotionComplexity(input.motionRequest);
  const selectedPack = input.selectedPackId ? input.packs.find((pack) => pack.id === input.selectedPackId) : undefined;
  const activePack = selectedPack ?? input.packs[0];

  const availablePackTypes = activePack?.pack_type ? [activePack.pack_type] : Array.from(new Set(input.packs.map((pack) => pack.pack_type)));
  const availableRoles =
    input.availableRoles ??
    (activePack
      ? Array.from(new Set(activePack.anchor_pack_items?.map((item) => item.role) ?? []))
      : Array.from(new Set(input.packs.flatMap((pack) => pack.anchor_pack_items?.map((item) => item.role) ?? []))));

  const stabilityScore = Number(input.aggregateStabilityScore ?? activePack?.aggregate_stability_score ?? 0);

  const routed = routeVideoMode({
    availablePackTypes,
    availableRoles,
    packStabilityScore: stabilityScore,
    motionComplexity,
    exactEndStateRequired: input.exactEndStateRequired,
    priorValidatedClipExists: input.priorValidatedClipExists,
  });

  const readiness = activePack
    ? buildPackReadinessReport({
        packType: activePack.pack_type,
        items: activePack.anchor_pack_items ?? [],
        aggregateStabilityScore: Number(activePack.aggregate_stability_score ?? stabilityScore),
        priorValidatedClipExists: input.priorValidatedClipExists,
      })
    : null;

  const desiredMode = normalizeDesiredMode(input.desiredMode);
  const desiredSuitability = readiness?.modeSuitability.find((entry) => entry.mode === desiredMode);

  const modeSelected = desiredMode && desiredSuitability && desiredSuitability.level !== "insufficient" ? desiredMode : routed.modeSelected;
  const whyModeSelected =
    desiredMode && desiredSuitability
      ? desiredSuitability.level === "insufficient"
        ? `Desired mode '${desiredMode}' was requested, but requirements are missing: ${desiredSuitability.reasons.join(" ")}`
        : `Desired mode '${desiredMode}' accepted. ${desiredSuitability.reasons.join(" ")}`
      : routed.whyModeSelected;

  const anchorRisk = deriveAnchorRisk(stabilityScore, motionComplexity);
  const requiredRoles = deriveRequiredRoles(modeSelected);
  const recommendedPackIds = activePack ? [activePack.id] : input.packs.slice(0, 3).map((pack) => pack.id);

  const missingRequirements = readiness
    ? readiness.modeSuitability
        .filter((modeEntry) => modeEntry.mode === modeSelected)
        .flatMap((modeEntry) => modeEntry.reasons)
    : [];

  return {
    mode_selected: modeSelected,
    why_mode_selected: whyModeSelected,
    recommended_pack_ids: recommendedPackIds,
    required_reference_roles: requiredRoles,
    duration_seconds: input.durationSeconds,
    aspect_ratio: input.aspectRatio,
    motion_complexity: motionComplexity,
    anchor_risk_level: anchorRisk,
    director_prompt: buildDirectorPrompt(input, modeSelected),
    fallback_prompt: "Keep pose change minimal. Preserve identity, garment drape, and scene continuity.",
    negative_constraints: DEFAULT_NEGATIVE_CONSTRAINTS,
    provider_order: input.preferredProviders?.length ? input.preferredProviders : ["veo-3.1", "veo-3.1-fast", "veo-2"],
    mode_suitability: readiness?.modeSuitability ?? [],
    pack_risk: readiness?.riskLevel ?? anchorRisk,
    missing_requirements: missingRequirements,
  };
}
