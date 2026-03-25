import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreativeFidelityPlan } from "@/lib/video/v2/creativeFidelity/types";

export async function persistCreativeFidelityPlan(supabase: SupabaseClient, plan: CreativeFidelityPlan) {
  const { error } = await supabase.from("clip_fidelity_plans").insert({
    clip_intent_id: plan.clipIntentId,
    decision: plan.decision,
    decision_reason: plan.reasons.join(" | "),
    recommended_mode: plan.recommendedMode,
    fidelity_tier: plan.riskSummary.fidelityTier,
    motion_complexity: plan.riskSummary.motionComplexity,
    view_dependency: plan.riskSummary.viewDependency,
    garment_risk: plan.riskSummary.garmentRisk,
    scene_risk: plan.riskSummary.sceneRisk,
    risk_summary: plan.riskSummary,
    required_roles: plan.requiredRoles,
    missing_roles: plan.missingRoles,
    critical_missing_roles: plan.criticalMissingRoles,
    allowed_synthesis_roles: plan.allowedSynthesisRoles,
    recommendations: plan.recommendations,
  });

  if (error) throw new Error(error.message);
}
