import { PrintFidelityLevel, PrintGateResult, PrintReadinessSummary, WorkflowMode } from "@/lib/tryon/types";

export function evaluatePrintGate(input: {
  workflowMode: WorkflowMode;
  fidelityLevel: string;
  printLockEnabled: boolean;
  printFidelityLevel: PrintFidelityLevel;
  printReadinessSummary: PrintReadinessSummary;
  selectedReferencePack: {
    printCriticalAssetIds?: string[];
    printDistributionAssetIds?: string[];
    printDetailAssetIds?: string[];
  };
}): PrintGateResult {
  const reasons: string[] = [];
  const missingCritical: string[] = [];
  const isCatalog = input.workflowMode === "catalog_fidelity";

  if (!input.printReadinessSummary.hasFrontPrintView) missingCritical.push("front_print_view");
  if (!input.printReadinessSummary.hasClosePrintDetail) missingCritical.push("close_print_detail");

  const hasDistributionCoverage = (input.selectedReferencePack.printDistributionAssetIds?.length ?? 0) > 0
    || input.printReadinessSummary.hasDistributionView;
  if (!hasDistributionCoverage) missingCritical.push("distribution_view");

  const hardLock = input.printLockEnabled && input.printFidelityLevel === "hard_lock";
  const strictLock = input.printLockEnabled && (input.printFidelityLevel === "strict" || hardLock);

  if (hardLock && missingCritical.length >= 2) {
    reasons.push("Hard print lock could not be fully honored with the current references.");
    return {
      allowed: true,
      severity: "warn",
      reasons,
      missingCritical,
      fallbackPrintMode: "strict",
    };
  }

  if (strictLock && missingCritical.length > 0) {
    reasons.push("Print lock requested but print-critical references are incomplete.");
    return {
      allowed: true,
      severity: isCatalog ? "warn" : "ok",
      reasons,
      missingCritical,
      fallbackPrintMode: "balanced",
    };
  }

  if (!input.printLockEnabled && input.printReadinessSummary.totalPrintRelevantAssets < 2) {
    reasons.push("Print reference set is weak; output may preserve structure more than print identity.");
    return {
      allowed: true,
      severity: "warn",
      reasons,
      missingCritical,
      fallbackPrintMode: null,
    };
  }

  return {
    allowed: true,
    severity: "ok",
    reasons,
    missingCritical,
    fallbackPrintMode: null,
  };
}
