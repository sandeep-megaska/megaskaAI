export type TryOnConstraintMap = Record<string, string | boolean | null | undefined>;

export type WorkflowMode = "standard_tryon" | "catalog_fidelity";
export type FidelityLevel = "balanced" | "strict" | "hard_lock";
export type PreferredOutputStyle = "catalog" | "studio" | "lifestyle";

export type ConstraintProfile = {
  preservePrint: boolean;
  preserveNeckline: boolean;
  preserveSleeveShape: boolean;
  preserveLength: boolean;
  preserveCoverage: boolean;
  preserveColor: boolean;
  allowPoseChange: boolean;
  allowBackgroundChange: boolean;
  allowStylingVariation: boolean;
  fitMode: "strict" | "balanced" | "relaxed";
  compositionMode: "studio" | "catalog" | "campaign" | "social";
  allowedVariationLevel: "low" | "medium" | "high";
  preservationPriority: string[];
  compositionIntent: "catalog" | "campaign" | "social";
  rawConstraints: TryOnConstraintMap;
};

export type WorkflowProfile = {
  workflowMode: WorkflowMode;
  fidelityLevel: FidelityLevel;
  preferredOutputStyle: PreferredOutputStyle;
  creativeFreedom: "low" | "medium" | "high";
  shouldUseCatalogRules: boolean;
  shouldAllowSceneStyling: boolean;
  shouldAllowPoseVariation: boolean;
  shouldAllowBackgroundVariation: boolean;
};

export type HardPreservationRules = {
  preserveGarmentCategory: boolean;
  preserveSilhouette: boolean;
  preserveNeckline: boolean;
  preserveSleeveShape: boolean;
  preserveHemLength: boolean;
  preserveCoverage: boolean;
  preservePrintPlacement: boolean;
  preserveColorFamily: boolean;
  preserveBustConstruction: boolean;
  preserveWaistConstruction: boolean;
  preserveSkirtPresence: boolean;
};

export type CatalogReadinessGateResult = {
  allowed: boolean;
  severity: "ok" | "warn" | "block";
  reasons: string[];
  missingCritical: string[];
  fallbackMode: WorkflowMode | null;
};

export type GarmentAssetRecord = {
  id: string;
  asset_type: string;
  public_url: string;
  view_label?: string | null;
  detail_zone?: string | null;
  is_primary?: boolean;
  sort_order?: number | null;
};

export type GarmentReferenceBundle = {
  silhouetteReferences: string[];
  detailReferences: string[];
  fabricPrintReferences: string[];
  preservationPriorities: string[];
};
