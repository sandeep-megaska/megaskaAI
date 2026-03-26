import { GARMENT_RISK_TIER_SCORE, TRUTH_DEBT_DECISION_BY_LEVEL, TRUTH_DEBT_THRESHOLDS, VERIFIED_TRUTH_SOURCE_KINDS } from "@/lib/video/v2/governance/rules";
import type { GovernanceAnchorRole, GovernanceMotionComplexity, TruthDebtInput, TruthDebtLevel, TruthDebtResult } from "@/lib/video/v2/governance/types";

function debtLevelFromScore(score: number): TruthDebtLevel {
  if (score >= TRUTH_DEBT_THRESHOLDS.critical) return "critical";
  if (score >= TRUTH_DEBT_THRESHOLDS.high) return "high";
  if (score >= TRUTH_DEBT_THRESHOLDS.medium) return "medium";
  return "low";
}

function hasVerifiedRole(anchors: GovernanceAnchorRole[], role: string): boolean {
  return anchors.some((anchor) => anchor.role === role && (anchor.isVerified || VERIFIED_TRUTH_SOURCE_KINDS.has(String(anchor.sourceKind ?? "").toLowerCase())));
}

function normalizedMotionScore(value: GovernanceMotionComplexity): number {
  if (value === "dynamic" || value === "high") return 24;
  if (value === "moderate" || value === "medium") return 14;
  return 6;
}

export function assessTruthDebt(input: TruthDebtInput): TruthDebtResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const missingAnchorRoles: string[] = [];
  const requiredNextAnchors: string[] = [];

  const frontToBack = input.startState === "front" && input.endState === "back";
  const hasVerifiedBack = hasVerifiedRole(input.availableAnchors, "back");
  const hasVerifiedFront = hasVerifiedRole(input.availableAnchors, "front");

  let score = GARMENT_RISK_TIER_SCORE[input.garmentRiskTier] + normalizedMotionScore(input.motionComplexity);

  if (input.cameraComplexity === "cinematic") score += 22;
  else if (input.cameraComplexity === "simple") score += 8;

  if (!hasVerifiedFront) {
    score += 15;
    missingAnchorRoles.push("front");
    requiredNextAnchors.push("front");
  }

  if (!hasVerifiedBack) {
    score += 18;
    missingAnchorRoles.push("back");
    if (input.backRevealRequested || frontToBack) requiredNextAnchors.push("back");
  }

  if (!input.hasTransitionTruth) {
    score += 16;
    requiredNextAnchors.push("mid_turn_left");
    warnings.push("Transition truth is missing for a view-changing motion.");
  }

  if (input.silhouetteRisk === "high") score += 16;
  else if (input.silhouetteRisk === "medium") score += 8;

  if (input.printContinuityRisk === "high") score += 14;
  else if (input.printContinuityRisk === "medium") score += 7;

  const compactRequired = Array.from(new Set(requiredNextAnchors));
  const compactMissing = Array.from(new Set(missingAnchorRoles));

  if (input.garmentRiskTier === "tier3" && frontToBack && !hasVerifiedBack) {
    return {
      totalScore: Math.max(score, TRUTH_DEBT_THRESHOLDS.critical),
      debtLevel: "critical",
      decision: "block",
      missingAnchorRoles: compactMissing,
      requiredNextAnchors: Array.from(new Set([...compactRequired, "back"])),
      downgradeRecommendation: null,
      reasons: ["Tier3 garment cannot run front->back motion without verified back anchor truth."],
      warnings,
    };
  }

  if (input.garmentRiskTier === "tier3" && (input.motionComplexity === "moderate" || input.motionComplexity === "dynamic" || input.motionComplexity === "medium" || input.motionComplexity === "high") && !input.hasTransitionTruth) {
    return {
      totalScore: Math.max(score, TRUTH_DEBT_THRESHOLDS.critical),
      debtLevel: "critical",
      decision: "block",
      missingAnchorRoles: compactMissing,
      requiredNextAnchors: Array.from(new Set([...compactRequired, "mid_turn_left"])),
      downgradeRecommendation: null,
      reasons: ["Tier3 garment with moderate/high motion requires verified transition truth."],
      warnings,
    };
  }

  if ((input.silhouetteClass === "modest" || input.silhouetteClass === "layered") && input.cameraComplexity === "cinematic") {
    return {
      totalScore: Math.max(score, TRUTH_DEBT_THRESHOLDS.critical),
      debtLevel: "critical",
      decision: "block",
      missingAnchorRoles: compactMissing,
      requiredNextAnchors: compactRequired,
      downgradeRecommendation: "Reduce camera complexity to static/simple and re-plan transition states.",
      reasons: ["Modest/layered silhouettes are blocked for cinematic camera moves to prevent garment drift."],
      warnings,
    };
  }

  if (frontToBack) reasons.push("Front->back transition increases truth debt and requires stronger state continuity.");

  const debtLevel = debtLevelFromScore(score);
  const decision = TRUTH_DEBT_DECISION_BY_LEVEL[debtLevel];
  const downgradeRecommendation = decision === "downgrade"
    ? "Downgrade to lower motion/camera complexity and add verified transition anchor before generate."
    : null;

  if (decision === "allow_with_warning") warnings.push("Proceed with caution; truth debt is elevated.");
  if (decision === "downgrade") warnings.push("Requested shot should be downgraded before compile/generate.");

  return {
    totalScore: score,
    debtLevel,
    decision,
    missingAnchorRoles: compactMissing,
    requiredNextAnchors: compactRequired,
    downgradeRecommendation,
    reasons,
    warnings,
  };
}
