import type { CreativeFidelityPlan, PlannerDecision, RiskSummary, RoleCoverage, RoleRequirements } from "@/lib/video/v2/creativeFidelity/types";
import type { V2Mode } from "@/lib/video/v2/types";

function recommendMode(risk: RiskSummary, coverage: RoleCoverage): V2Mode {
  if (risk.fidelityTier === "high" && coverage.hasFrames) return "frames_to_video";
  return "ingredients_to_video";
}

export function decideCreativeFidelity(input: {
  clipIntentId: string;
  workingPackId: string;
  risk: RiskSummary;
  roleRequirements: RoleRequirements;
  roleCoverage: RoleCoverage;
}): CreativeFidelityPlan {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];

  let decision: PlannerDecision = "proceed";

  if (input.risk.unsafeConcepts.length > 0) {
    decision = "block";
    reasons.push("Unsafe concept detected and blocked before generation.");
  }

  if (input.roleRequirements.criticalMissingRoles.length > 0) {
    decision = "block";
    reasons.push(`Critical required anchors missing: ${input.roleRequirements.criticalMissingRoles.join(", ")}.`);
  } else if (input.roleRequirements.missingRoles.length > 0) {
    decision = "block";
    reasons.push(`Required anchors missing: ${input.roleRequirements.missingRoles.join(", ")}.`);
  }

  if (decision !== "block" && input.risk.waterExposure && input.risk.garmentRisk !== "low") {
    decision = "warn";
    warnings.push("Water/environment exposure increases garment fidelity risk.");
    recommendations.push("Prefer minimal motion and lock garment-critical frames.");
  }

  if (decision !== "block" && input.risk.surrealExposure && input.risk.fidelityTier === "high") {
    decision = "warn";
    warnings.push("Surreal cinematic request may drift from anchor truth.");
    recommendations.push("Constrain surreal effects to background/context only.");
  }

  if (
    decision !== "block"
    && input.risk.fidelityTier !== "low"
    && ["three_quarter_left", "three_quarter_right", "back"].some((role) => input.roleCoverage.synthesizedRoles.has(role))
  ) {
    decision = "warn";
    warnings.push("Synthesized side/back anchors detected for non-low-fidelity motion.");
    recommendations.push("Replace synthesized side/back anchors with real captures for critical shots.");
  }

  if (decision === "proceed") {
    reasons.push("Anchor coverage and requested motion are aligned for controlled generation.");
  }

  if (decision === "warn" && reasons.length === 0) {
    reasons.push("Generation allowed with caution; fidelity drift risks were detected.");
  }

  return {
    clipIntentId: input.clipIntentId,
    workingPackId: input.workingPackId,
    decision,
    recommendedMode: recommendMode(input.risk, input.roleCoverage),
    reasons,
    recommendations,
    warnings,
    riskSummary: input.risk,
    requiredRoles: input.roleRequirements.requiredRoles,
    missingRoles: input.roleRequirements.missingRoles,
    criticalMissingRoles: input.roleRequirements.criticalMissingRoles,
    allowedSynthesisRoles: input.roleRequirements.allowedSynthesisRoles,
  };
}
