// Megaska AI Studio V2: shared contracts for anchor packs, mode routing, and director planning.

export const ANCHOR_PACK_TYPES = ["identity", "garment", "scene", "hybrid"] as const;
export type AnchorPackType = (typeof ANCHOR_PACK_TYPES)[number];

export const ANCHOR_PACK_STATUSES = ["draft", "ready", "archived"] as const;
export type AnchorPackStatus = (typeof ANCHOR_PACK_STATUSES)[number];

export const ANCHOR_ITEM_ROLES = [
  "front",
  "three_quarter_left",
  "three_quarter_right",
  "back",
  "detail",
  "context",
  "face_closeup",
  "fit_anchor",
  "start_frame",
  "end_frame",
] as const;
export type AnchorPackItemRole = (typeof ANCHOR_ITEM_ROLES)[number];

export const V2_MODE_OPTIONS = ["ingredients_to_video", "frames_to_video", "scene_extension"] as const;
export type V2Mode = (typeof V2_MODE_OPTIONS)[number];

export type MotionComplexity = "low" | "medium" | "high";
export type AnchorRiskLevel = "low" | "medium" | "high";

export type AnchorPackItem = {
  id: string;
  anchor_pack_id: string;
  generation_id: string;
  role: AnchorPackItemRole;
  sort_order: number;
  camera_signature: string | null;
  lighting_signature: string | null;
  pose_signature: string | null;
  garment_signature: string | null;
  scene_signature: string | null;
  stability_score: number;
  notes: string | null;
  generation?: {
    id: string;
    prompt: string | null;
    asset_url: string | null;
    url: string | null;
    generation_kind: string | null;
  } | null;
};

export type AnchorPack = {
  id: string;
  pack_name: string;
  pack_type: AnchorPackType;
  status: AnchorPackStatus;
  notes: string | null;
  aggregate_stability_score: number;
  is_ready: boolean;
  created_at: string;
  updated_at: string;
  anchor_pack_items?: AnchorPackItem[];
};

export type ModeRoutingInput = {
  availablePackTypes: AnchorPackType[];
  availableRoles: AnchorPackItemRole[];
  packStabilityScore: number;
  motionComplexity: MotionComplexity;
  exactEndStateRequired: boolean;
  priorValidatedClipExists: boolean;
};

export type ModeRoutingResult = {
  modeSelected: V2Mode;
  whyModeSelected: string;
};

export type DirectorPlanContract = {
  mode_selected: V2Mode;
  why_mode_selected: string;
  recommended_pack_ids: string[];
  required_reference_roles: AnchorPackItemRole[];
  duration_seconds: number;
  aspect_ratio: string;
  motion_complexity: MotionComplexity;
  anchor_risk_level: AnchorRiskLevel;
  director_prompt: string;
  fallback_prompt: string;
  negative_constraints: string[];
  provider_order: string[];
};

export type DirectorPlannerInput = {
  motionRequest: string;
  durationSeconds: number;
  aspectRatio: string;
  exactEndStateRequired: boolean;
  priorValidatedClipExists: boolean;
  preferredProviders?: string[];
  packs: AnchorPack[];
};
