import { CatalogReadinessGateResult, WorkflowProfile } from "@/lib/tryon/types";

type ReadinessSummary = {
  hasFront?: boolean;
  hasBack?: boolean;
  hasNeckline?: boolean;
  hasSleeveOrStrap?: boolean;
  hasHem?: boolean;
  missing?: string[];
};

export function evaluateCatalogReadinessGate(input: {
  readinessSummary: ReadinessSummary;
  workflowProfile: WorkflowProfile;
}): CatalogReadinessGateResult {
  const missingCritical: string[] = [];
  const reasons: string[] = [];

  if (!input.readinessSummary.hasFront) missingCritical.push("primary_front");
  if (!input.readinessSummary.hasBack) reasons.push("Back full view is missing; rear fidelity may drift.");
  if (!input.readinessSummary.hasNeckline) reasons.push("Neckline detail missing.");
  if (!input.readinessSummary.hasSleeveOrStrap) reasons.push("Sleeve/strap detail missing.");
  if (!input.readinessSummary.hasHem) reasons.push("Hem/length detail missing.");

  if (missingCritical.length > 0) {
    return {
      allowed: false,
      severity: "block",
      reasons: ["Front full view is required for catalog fidelity mode."],
      missingCritical,
      fallbackMode: "standard_tryon",
    };
  }

  if (input.workflowProfile.workflowMode === "catalog_fidelity" && reasons.length > 1) {
    return {
      allowed: true,
      severity: "warn",
      reasons,
      missingCritical,
      fallbackMode: input.workflowProfile.fidelityLevel === "hard_lock" ? "standard_tryon" : null,
    };
  }

  return {
    allowed: true,
    severity: "ok",
    reasons,
    missingCritical,
    fallbackMode: null,
  };
}
