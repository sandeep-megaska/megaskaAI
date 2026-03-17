import {
  ConstraintProfile,
  GarmentAssetRecord,
  HardPreservationRules,
  WorkflowProfile,
} from "@/lib/tryon/types";

type GarmentMeta = {
  category?: string | null;
  displayName?: string | null;
  silhouetteNotes?: string | null;
  coverageNotes?: string | null;
};

function hasSkirtSignal(text: string) {
  return ["swimdress", "dress", "skirt", "modest", "coverage"].some((token) => text.includes(token));
}

export function buildHardPreservationRules(input: {
  workflowProfile: WorkflowProfile;
  constraintProfile: ConstraintProfile;
  garment: GarmentMeta;
  selectedAssets?: GarmentAssetRecord[];
}): HardPreservationRules {
  const text = [
    input.garment.category ?? "",
    input.garment.displayName ?? "",
    input.garment.silhouetteNotes ?? "",
    input.garment.coverageNotes ?? "",
  ].join(" ").toLowerCase();

  const hasHemDetail = (input.selectedAssets ?? []).some((asset) => ["hem", "length", "skirt"].includes((asset.detail_zone ?? "").toLowerCase()));
  const skirtSignal = hasSkirtSignal(text) || hasHemDetail;

  return {
    preserveGarmentCategory: true,
    preserveSilhouette: true,
    preserveNeckline: input.constraintProfile.preserveNeckline,
    preserveSleeveShape: input.constraintProfile.preserveSleeveShape,
    preserveHemLength: input.constraintProfile.preserveLength || input.workflowProfile.shouldUseCatalogRules,
    preserveCoverage: input.constraintProfile.preserveCoverage || input.workflowProfile.shouldUseCatalogRules,
    preservePrintPlacement: input.constraintProfile.preservePrint,
    preserveColorFamily: input.constraintProfile.preserveColor,
    preserveBustConstruction: input.workflowProfile.shouldUseCatalogRules,
    preserveWaistConstruction: input.workflowProfile.shouldUseCatalogRules,
    preserveSkirtPresence: skirtSignal,
  };
}
