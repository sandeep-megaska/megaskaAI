import type { V2Mode } from "@/lib/video/v2/types";

export function buildCompileTraceabilitySnapshot(input: {
  clipIntentId: string;
  workingPackId: string;
  sourceProfileId: string;
  compiledAnchorPackId: string;
  workingPackReadinessScore: number;
  directorPrompt: string;
  fallbackPrompt: string;
  modeSelected: V2Mode;
  providerSelected: string;
  modelSelected: string;
  anchorCount: number;
  fidelityPlan: { decision: string; reasons: string[]; warnings: string[]; recommendedMode: V2Mode };
}) {
  return {
    clip_intent_id: input.clipIntentId,
    working_pack_id: input.workingPackId,
    source_profile_id: input.sourceProfileId,
    compiled_anchor_pack_id: input.compiledAnchorPackId,
    generation_origin: "slice_c_compiled",
    working_pack_readiness_score: input.workingPackReadinessScore,
    director_prompt: input.directorPrompt,
    fallback_prompt: input.fallbackPrompt,
    mode_selected: input.modeSelected,
    provider_selected: input.providerSelected,
    model_selected: input.modelSelected,
    anchor_count: input.anchorCount,
    creative_fidelity_plan: {
      decision: input.fidelityPlan.decision,
      reasons: input.fidelityPlan.reasons,
      warnings: input.fidelityPlan.warnings,
      recommended_mode: input.fidelityPlan.recommendedMode,
    },
  };
}
