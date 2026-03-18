export type LookbookWorkflowMode = "consistent-lookbook";
export type LookbookJobVariant = "catalog" | "lifestyle";
export type LookbookThemeKey =
  | "luxury_poolside"
  | "resort_editorial"
  | "premium_studio_lifestyle"
  | "tropical_escape"
  | "minimal_neutral_editorial"
  | "sunlit_terrace"
  | "modern_indoor_luxury";

export type LookbookReferenceKind = "model_identity" | "garment_front" | "garment_back" | "garment_detail";

export type LookbookReferenceImage = {
  kind: LookbookReferenceKind;
  url: string;
  assetId?: string;
  label?: string;
};

export type LookbookShotKey =
  | "front_full"
  | "back_full"
  | "side_right"
  | "three_quarter_angle"
  | "detail_upper"
  | "lifestyle_studio"
  | "poolside_standing"
  | "resort_walk"
  | "seated_lounge"
  | "studio_shadow"
  | "sunlit_terrace"
  | "close_fashion";

export type LookbookShotSpec = {
  shotKey: LookbookShotKey;
  title: string;
  instruction: string;
  aspectRatio?: "1:1" | "16:9" | "9:16";
  styleHint?: "catalog" | "studio" | "lifestyle";
  framing?: string;
  angle?: string;
  backgroundStyle?: string;
  poseInstruction?: string;
  sceneKey?: string | null;
  poseKey?: string | null;
  moodKey?: string | null;
};

export type LookbookConstraintProfile = {
  noReconstruction: boolean;
  preserveModelIdentity: boolean;
  preserveGarmentStructure: boolean;
  preservePrintPlacement: boolean;
  preserveColorway: boolean;
  preserveSilhouette: boolean;
  preserveTrimAndSeamLayout: boolean;
  forbidRedesign: boolean;
  forbidReinterpretation: boolean;
  forbidGarmentReplacement: boolean;
  forbidStyleDrift: boolean;
};

export type LookbookExecutionPayload = {
  workflowMode: LookbookWorkflowMode;
  backendModel: string;
  outputStyle: "catalog" | "studio" | "lifestyle";
  jobVariant: LookbookJobVariant;
  themeKey?: string | null;
  references: LookbookReferenceImage[];
  shot: LookbookShotSpec;
  constraints: LookbookConstraintProfile;
  prompt: string;
  promptHash: string;
  debugTrace?: Record<string, unknown>;
};

export type LookbookShotResult = {
  shot: LookbookShotSpec;
  bytes: Buffer;
  mimeType: string;
  backendModel: string;
  debugTrace: Record<string, unknown>;
  warnings: string[];
};
