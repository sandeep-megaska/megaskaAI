import type { Decision, FidelityLevel, RecommendedMode } from "./types";

type DecisionInput = {
  totalRiskScore: number;
  levels: FidelityLevel[];
  criticalMissingRoles: string[];
  missingRoles: string[];
  synthesisBlockedRoles: string[];
  availableRoles: string[];
  hasStartFrame: boolean;
  hasEndFrame: boolean;
};

function includesHighOrVeryHigh(levels: FidelityLevel[]) {
  return levels.some((level) => level === "high" || level === "very_high");
}

export function decidePlan(input: DecisionInput): {
  decision: Decision;
  recommendedMode: RecommendedMode;
  reasons: string[];
  recommendations: string[];
} {
  const reasons: string[] = [];
  const recommendations: string[] = [];

  const veryHighCount = input.levels.filter((level) => level === "very_high").length;

  if (input.criticalMissingRoles.length > 0) {
    reasons.push(`Critical required anchors are missing: ${input.criticalMissingRoles.join(", ")}.`);
    recommendations.push("Upload the missing critical anchor views before generation.");
  }

  if (input.synthesisBlockedRoles.length > 0) {
    reasons.push(`Critical roles depend on synthesized anchors: ${input.synthesisBlockedRoles.join(", ")}.`);
    recommendations.push("Replace synthesized critical roles with image-system truth anchors.");
  }

  if (input.missingRoles.length > 0 && input.criticalMissingRoles.length === 0) {
    reasons.push(`Some non-critical required anchors are missing: ${input.missingRoles.join(", ")}.`);
    recommendations.push("Add missing support anchors to improve consistency.");
  }

  if (input.totalRiskScore >= 80 || veryHighCount >= 3) {
    reasons.push("Overall creative fidelity risk is very high for current anchor coverage.");
    recommendations.push("Reduce scene or motion complexity for the first pass.");
  }

  let decision: Decision = "proceed";
  if (input.criticalMissingRoles.length > 0 || input.synthesisBlockedRoles.length > 0 || input.totalRiskScore >= 95) {
    decision = "block";
  } else if (input.missingRoles.length > 0 || includesHighOrVeryHigh(input.levels) || input.totalRiskScore >= 45) {
    decision = "warn";
  }

  if (decision === "warn") {
    recommendations.push("Keep the scene fixed and simplify camera movement for safer generation.");
  }

  let recommendedMode: RecommendedMode = "ingredients_to_video";
  const constrainedShot = input.totalRiskScore <= 40 && input.availableRoles.includes("front") && input.availableRoles.includes("fit_anchor");
  if ((input.hasStartFrame && input.hasEndFrame && decision !== "block") || constrainedShot) {
    recommendedMode = "frames_to_video";
  }

  if (recommendedMode === "ingredients_to_video" && decision !== "block") {
    recommendations.push("Use ingredients_to_video for broader composition while preserving anchor constraints.");
  }

  return { decision, recommendedMode, reasons, recommendations };
}
