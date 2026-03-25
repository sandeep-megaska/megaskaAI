import { planCreativeFidelity } from "@/lib/video/v2/creativeFidelity/planner";
import type { CreativeFidelityItem } from "@/lib/video/v2/creativeFidelity/types";

/**
 * @deprecated Use planCreativeFidelity from /creativeFidelity/planner.
 * Thin wrapper kept temporarily for merge safety.
 */
export function computeFidelityPlan(input: {
  clipIntentId: string;
  motionPrompt: string;
  workingPackId: string;
  items: CreativeFidelityItem[];
}) {
  const plan = planCreativeFidelity(input);
  return {
    clip_intent_id: plan.clipIntentId,
    working_pack_id: plan.workingPackId,
    fidelity_tier: plan.riskSummary.fidelityTier,
    motion_complexity: plan.riskSummary.motionComplexity,
    view_dependency: plan.riskSummary.viewDependency,
    garment_risk: plan.riskSummary.garmentRisk,
    scene_risk: plan.riskSummary.sceneRisk,
    required_roles: plan.requiredRoles,
    missing_roles: plan.missingRoles,
    allowed_synthesis_roles: plan.allowedSynthesisRoles,
    decision: plan.decision,
    reason: plan.reasons.join(" | "),
    recommended_mode: plan.recommendedMode,
  };
}
