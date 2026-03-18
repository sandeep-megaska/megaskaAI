export type TryOnConstraintMap = Record<string, string | boolean | null | undefined>;

export type WorkflowMode = "standard_tryon" | "catalog_fidelity";
export type FidelityLevel = "balanced" | "strict" | "hard_lock";
export type PreferredOutputStyle = "catalog" | "studio" | "lifestyle";
export type PrintFidelityLevel = "balanced" | "strict" | "hard_lock";

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

export type PrintReadinessStatus = "print_reference_weak" | "print_reference_medium" | "print_reference_strong";

export type PrintReadinessSummary = {
  hasFrontPrintView: boolean;
  hasBackPrintView: boolean;
  hasClosePrintDetail: boolean;
  hasFabricTextureDetail: boolean;
  hasDistributionView: boolean;
  totalPrintRelevantAssets: number;
  missing: string[];
};

export type PrintReadinessResult = {
  printReadinessScore: number;
  printReadinessStatus: PrintReadinessStatus;
  printReferenceSummary: PrintReadinessSummary;
};

export type PrintPreservationRules = {
  preservePrintPattern: boolean;
  preservePrintDensity: boolean;
  preservePrintDistribution: boolean;
  preserveColorComplexity: boolean;
  preserveColorFamily: boolean;
  preserveTextureRichness: boolean;
  preservePatternScale: boolean;
  preserveFrontBackPatternContinuity: boolean;
  confidence: "low" | "medium" | "high";
};

export type PrintGateResult = {
  allowed: boolean;
  severity: "ok" | "warn" | "block";
  reasons: string[];
  missingCritical: string[];
  fallbackPrintMode: PrintFidelityLevel | null;
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

export type TryOnReferenceImageKind = "subject" | "garment_silhouette" | "garment_detail" | "garment_print";

export type TryOnReferenceImage = {
  kind: TryOnReferenceImageKind;
  url: string;
  assetId?: string;
  label?: string;
};

export type TryOnConstraintProfile = {
  noReconstruction: boolean;
  preserveStructure: boolean;
  preservePrintPlacement: boolean;
  preserveColorway: boolean;
  preserveSilhouette: boolean;
  allowPoseAdaptation: boolean;
  allowFitAdaptation: boolean;
  allowPerspectiveAdaptation: boolean;
};

export type TryOnExecutionPayload = {
  workflowMode: WorkflowMode | "video-try-on";
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: "1:1" | "16:9" | "9:16";
  backendModel: string;
  references: TryOnReferenceImage[];
  compiledPrompt?: string;
  constraints: TryOnConstraintProfile;
  debugTrace?: Record<string, unknown>;
};
