import { decidePlan } from "./decision";
import { parseCreativeIntent } from "./intentParser";
import { scoreRiskDimensions } from "./riskScoring";
import { inferRequiredRoles } from "./roleInference";
import type { FidelityPlan, PlannerInput } from "./types";

function uniq(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function planCreativeFidelity(input: PlannerInput): FidelityPlan {
  const signals = parseCreativeIntent(input.prompt || "");
  const inferred = inferRequiredRoles(signals);

  const availableRoles = uniq(input.available_roles ?? []);
  const requiredRoles = uniq(inferred.required_roles);
  const criticalRoles = uniq(inferred.critical_roles);

  const missingRoles = requiredRoles.filter((role) => !availableRoles.includes(role));
  const criticalMissingRoles = criticalRoles.filter((role) => !availableRoles.includes(role));

  const synthesisAllowedRoles = missingRoles.filter((role) => !criticalRoles.includes(role));
  const synthesisBlockedRoles = criticalRoles.filter((role) => (input.role_sources?.[role] ?? "reused") === "synthesized");

  const scores = scoreRiskDimensions({
    signals,
    input,
    missingRoles,
    criticalMissingRoles,
    criticalRoles,
    blockedSynthesisRoles: synthesisBlockedRoles,
  });

  const decision = decidePlan({
    totalRiskScore: scores.totalRiskScore,
    levels: [scores.motion.level, scores.camera.level, scores.scene.level, scores.garment.level, scores.identity.level, scores.viewDependency.level, scores.environment.level, scores.anchor.level],
    criticalMissingRoles,
    missingRoles,
    synthesisBlockedRoles,
    availableRoles,
    hasStartFrame: input.has_start_frame ?? availableRoles.includes("start_frame"),
    hasEndFrame: input.has_end_frame ?? availableRoles.includes("end_frame"),
  });

  const reasons = uniq([
    ...decision.reasons,
    ...scores.motion.reasons,
    ...scores.camera.reasons,
    ...scores.scene.reasons,
    ...scores.garment.reasons,
    ...scores.identity.reasons,
    ...scores.viewDependency.reasons,
    ...scores.environment.reasons,
    ...scores.anchor.reasons,
  ]);

  const recommendations = uniq([
    ...decision.recommendations,
    ...(criticalMissingRoles.length ? criticalMissingRoles.map((role) => `Upload a ${role} anchor.`) : []),
    ...(missingRoles.includes("three_quarter_left") || missingRoles.includes("three_quarter_right") ? ["Generate side anchors first using the image system."] : []),
    ...(scores.motion.level === "very_high" ? ["Reduce motion complexity for the initial generation pass."] : []),
    ...(scores.scene.level === "very_high" ? ["Keep the scene fixed for the first pass before adding transitions."] : []),
  ]);

  return {
    motion_complexity: scores.motion.level,
    camera_complexity: scores.camera.level,
    scene_complexity: scores.scene.level,
    garment_risk: scores.garment.level,
    identity_risk: scores.identity.level,
    view_dependency_risk: scores.viewDependency.level,
    environment_risk: scores.environment.level,
    anchor_risk_level: scores.anchor.level,
    required_roles: requiredRoles,
    available_roles: availableRoles,
    missing_roles: missingRoles,
    critical_missing_roles: criticalMissingRoles,
    synthesis_allowed_roles: synthesisAllowedRoles,
    synthesis_blocked_roles: synthesisBlockedRoles,
    decision: decision.decision,
    recommended_mode: decision.recommendedMode,
    reasons,
    recommendations,
    summary: {
      total_risk_score: scores.totalRiskScore,
      safe_to_generate: decision.decision !== "block",
      requires_user_attention: decision.decision !== "proceed",
    },
  };
}
