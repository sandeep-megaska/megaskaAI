import { decideCreativeFidelity } from "@/lib/video/v2/creativeFidelity/decision";
import { parseIntentSignals } from "@/lib/video/v2/creativeFidelity/intentParser";
import { inferRoleCoverage, resolveRoleRequirements } from "@/lib/video/v2/creativeFidelity/roleInference";
import { buildRiskSummary } from "@/lib/video/v2/creativeFidelity/riskScoring";
import type { CreativeFidelityPlan, PlanCreativeFidelityInput } from "@/lib/video/v2/creativeFidelity/types";

export type { CreativeFidelityPlan, PlanCreativeFidelityInput };

export function planCreativeFidelity(input: PlanCreativeFidelityInput): CreativeFidelityPlan {
  const signals = parseIntentSignals(input.motionPrompt);
  const coverage = inferRoleCoverage(input.items);
  const risk = buildRiskSummary(signals);
  const requirements = resolveRoleRequirements(risk.fidelityTier, coverage);

  return decideCreativeFidelity({
    clipIntentId: input.clipIntentId,
    workingPackId: input.workingPackId,
    risk,
    roleCoverage: coverage,
    roleRequirements: requirements,
  });
}
