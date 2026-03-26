import { JUDGE_SEVERITY_SCORE, SALVAGE_ACTIONS_BY_SEVERITY } from "@/lib/video/v2/governance/rules";
import type { JudgeOutcome, JudgePassInput, JudgePassResult, JudgeSalvageAction, JudgeSeverity, JudgeViolation } from "@/lib/video/v2/governance/types";

function decideOutcome(totalSeverityScore: number, hasCritical: boolean): JudgeOutcome {
  if (hasCritical || totalSeverityScore >= 100) return "reject";
  if (totalSeverityScore >= 35) return "salvageable";
  return "pass";
}

function uniqueActions(actions: JudgeSalvageAction[]): JudgeSalvageAction[] {
  return Array.from(new Set(actions));
}

function suggestedActionsFromViolations(violations: JudgeViolation[]): JudgeSalvageAction[] {
  if (!violations.length) return [];
  const aggregate: JudgeSalvageAction[] = [];
  for (const violation of violations) {
    aggregate.push(...SALVAGE_ACTIONS_BY_SEVERITY[violation.severity]);
  }
  return uniqueActions(aggregate);
}

function scoreViolations(violations: JudgeViolation[]): { score: number; hasCritical: boolean } {
  let score = 0;
  let hasCritical = false;
  for (const violation of violations) {
    score += JUDGE_SEVERITY_SCORE[violation.severity];
    if (violation.severity === "critical") hasCritical = true;
  }
  return { score, hasCritical };
}

function normalizeGarmentPenalty(input: Pick<JudgePassInput["garment"], "riskTier" | "silhouetteClass" | "coverageClass">): number {
  let penalty = 0;
  if (input.riskTier === "tier3") penalty += 10;
  if (input.silhouetteClass === "layered" || input.silhouetteClass === "modest") penalty += 8;
  if (input.coverageClass === "high" || input.coverageClass === "full") penalty += 6;
  return penalty;
}

function segmentOutcome(segmentViolations: JudgeViolation[], fidelityScore: number): JudgeOutcome {
  const severity = scoreViolations(segmentViolations);
  if (fidelityScore < 40 || severity.hasCritical || severity.score >= 65) return "reject";
  if (fidelityScore < 70 || severity.score >= 25) return "salvageable";
  return "pass";
}

export function evaluateJudgePass(input: JudgePassInput): JudgePassResult {
  const severity = scoreViolations(input.violations);
  const garmentPenalty = normalizeGarmentPenalty(input.garment);
  const garmentFidelityScore = Math.max(0, Math.min(100, input.overallFidelityScore - severity.score / 2 - garmentPenalty));
  const outcome = decideOutcome(severity.score, severity.hasCritical);

  const segmentResults = (input.segments ?? []).map((segment) => ({
    segmentId: segment.segmentId,
    outcome: segmentOutcome(segment.violations, segment.fidelityScore),
    fidelityScore: segment.fidelityScore,
    violations: segment.violations,
  }));

  const reasons: string[] = [];
  if (!input.violations.length) reasons.push("No structured fidelity violations were reported.");
  if (outcome === "salvageable") reasons.push("Output is recoverable with targeted corrective actions.");
  if (outcome === "reject") reasons.push("Violations exceed garment constitution tolerance for safe salvage.");

  const salvageActions = suggestedActionsFromViolations(input.violations);

  if (outcome === "reject" && !salvageActions.includes("reject_fully")) {
    salvageActions.push("reject_fully");
  }

  return {
    outcome,
    garmentFidelityScore,
    violations: input.violations,
    salvageActions: uniqueActions(salvageActions),
    reasons,
    segmentResults,
  };
}

export function buildViolation(code: JudgeViolation["code"], severity: JudgeSeverity, message: string, segmentId?: string): JudgeViolation {
  return {
    code,
    severity,
    message,
    segmentId: segmentId ?? null,
  };
}
