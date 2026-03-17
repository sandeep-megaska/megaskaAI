import {
  GarmentAssetRecord,
  PrintFidelityLevel,
  PrintPreservationRules,
  PrintReadinessResult,
  WorkflowProfile,
} from "@/lib/tryon/types";

function isSolidLike(value?: string | null) {
  const normalized = (value ?? "").toLowerCase();
  return ["solid", "plain", "single color", "monochrome"].some((token) => normalized.includes(token));
}

export function buildPrintPreservationRules(input: {
  workflowProfile: WorkflowProfile;
  printLockEnabled: boolean;
  printFidelityLevel: PrintFidelityLevel;
  printReadiness: PrintReadinessResult;
  garment?: { printType?: string | null; colorway?: string | null };
  selectedAssets?: GarmentAssetRecord[];
}): PrintPreservationRules {
  const isCatalogMode = input.workflowProfile.workflowMode === "catalog_fidelity";
  const hardLock = input.printFidelityLevel === "hard_lock";
  const strict = input.printFidelityLevel === "strict" || hardLock;
  const confidence = input.printReadiness.printReadinessStatus === "print_reference_strong"
    ? "high"
    : input.printReadiness.printReadinessStatus === "print_reference_medium"
      ? "medium"
      : "low";

  const appearsSolid = isSolidLike(input.garment?.printType) || isSolidLike(input.garment?.colorway);
  const printCritical = Boolean(input.printLockEnabled) || isCatalogMode;

  return {
    preservePrintPattern: printCritical && !appearsSolid,
    preservePrintDensity: strict && !appearsSolid,
    preservePrintDistribution: printCritical,
    preserveColorComplexity: strict && !appearsSolid,
    preserveColorFamily: printCritical,
    preserveTextureRichness: printCritical && input.printReadiness.printReferenceSummary.hasFabricTextureDetail,
    preservePatternScale: strict && !appearsSolid,
    preserveFrontBackPatternContinuity: hardLock && input.printReadiness.printReferenceSummary.hasBackPrintView,
    confidence,
  };
}
