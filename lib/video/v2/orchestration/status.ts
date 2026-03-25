import type { CreativeFidelityPlan } from "@/lib/video/v2/creativeFidelity/types";
import type { WorkingPackSnapshot } from "@/lib/video/v2/orchestration/types";

export function getCompileBlockingReasons(workingPack: WorkingPackSnapshot, planner: CreativeFidelityPlan): string[] {
  const reasons: string[] = [];

  if (workingPack.status !== "ready") reasons.push("Working pack must be ready/approved before compile.");
  if (Number(workingPack.readinessScore ?? 0) < 0.55) reasons.push("Readiness score must be >= 0.55.");

  const roles = new Set(workingPack.roles);
  if (!roles.has("fit_anchor")) reasons.push("Required role missing: fit_anchor.");
  if (!roles.has("front")) reasons.push("Required role missing: front.");

  if (planner.decision === "block") reasons.push(planner.reasons[0] ?? "Creative fidelity planner blocked compile.");
  if (planner.missingRoles.length) reasons.push(`Planner still reports missing roles: ${planner.missingRoles.join(", ")}.`);

  return reasons;
}
