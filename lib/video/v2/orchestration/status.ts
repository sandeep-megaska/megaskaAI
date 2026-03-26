import type { CreativeFidelityPlan } from "@/lib/video/v2/creativeFidelity/types";
import type { WorkingPackSnapshot } from "@/lib/video/v2/orchestration/types";
import type { TransitionPlan } from "@/lib/video/v2/intermediateStateEngine";
import type { TruthDebtResult } from "@/lib/video/v2/governance/types";

export function getCompileBlockingReasons(
  workingPack: WorkingPackSnapshot,
  planner: CreativeFidelityPlan,
  transitionPlan?: TransitionPlan | null,
  truthDebt?: TruthDebtResult | null,
): string[] {
  const reasons: string[] = [];

  if (workingPack.status !== "ready") reasons.push("Working pack must be ready/approved before compile.");
  if (Number(workingPack.readinessScore ?? 0) < 0.55) reasons.push("Readiness score must be >= 0.55.");

  const roles = new Set(workingPack.roles);
  if (!roles.has("fit_anchor")) reasons.push("Required role missing: fit_anchor.");
  if (!roles.has("front")) reasons.push("Required role missing: front.");

  if (planner.decision === "block") reasons.push(planner.reasons[0] ?? "Creative fidelity planner blocked compile.");
  if (planner.missingRoles.length) reasons.push(`Planner still reports missing roles: ${planner.missingRoles.join(", ")}.`);
  if (transitionPlan?.strategy === "blocked_missing_intermediate") {
    reasons.push(transitionPlan.recommendations[0] ?? "Intermediate transition state is required before compile.");
  }

  if (transitionPlan?.direct_transition_discouraged && transitionPlan.strategy !== "segmented") {
    reasons.push("Direct transition is discouraged for this motion. Add an approved intermediate state.");
  }
  if (truthDebt?.decision === "block") {
    reasons.push(truthDebt.reasons[0] ?? "Governance truth debt blocked compile.");
  }
  if (truthDebt?.decision === "downgrade") {
    reasons.push(truthDebt.downgradeRecommendation ?? "Governance requires downgrade before compile.");
  }

  return reasons;
}
