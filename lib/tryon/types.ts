export type TryOnConstraintMap = Record<string, string | boolean | null | undefined>;

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
