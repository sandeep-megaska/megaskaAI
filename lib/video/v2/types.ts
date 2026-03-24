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

export const VIDEO_RUN_STATUSES = ["planned", "queued", "running", "succeeded", "failed", "validated", "completed"] as const;
export type VideoRunStatus = (typeof VIDEO_RUN_STATUSES)[number];

export type MotionComplexity = "low" | "medium" | "high";
export type AnchorRiskLevel = "low" | "medium" | "high";

export type SuitabilityLevel = "good" | "partial" | "insufficient" | "unavailable";

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

export type ModeSuitability = {
  mode: V2Mode;
  level: SuitabilityLevel;
  reasons: string[];
};

export type PackReadinessReport = {
  packType: AnchorPackType;
  aggregateStabilityScore: number;
  isReady: boolean;
  itemCount: number;
  presentRoles: AnchorPackItemRole[];
  missingRoles: AnchorPackItemRole[];
  duplicateRoles: AnchorPackItemRole[];
  warnings: string[];
  modeSuitability: ModeSuitability[];
  recommendedMode: V2Mode;
  riskLevel: AnchorRiskLevel;
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
  mode_suitability: ModeSuitability[];
  pack_risk: AnchorRiskLevel;
  missing_requirements: string[];
};

export type DirectorPlannerInput = {
  motionRequest: string;
  durationSeconds: number;
  aspectRatio: string;
  exactEndStateRequired: boolean;
  priorValidatedClipExists: boolean;
  desiredMode?: V2Mode;
  selectedPackId?: string;
  selectedPackType?: AnchorPackType;
  aggregateStabilityScore?: number;
  availableRoles?: AnchorPackItemRole[];
  preferredProviders?: string[];
  packs: AnchorPack[];
};

export type VideoRunValidationSummary = {
  id: string;
  overall_score: number;
  decision: "pass" | "retry" | "reject" | "manual_review";
  failure_reasons: string[];
  created_at: string;
};

export const RETRY_STRATEGIES = ["same_plan", "fallback_model", "fallback_provider", "safer_mode"] as const;
export type RetryStrategy = (typeof RETRY_STRATEGIES)[number];
export const RUN_ACTION_TYPES = ["retry", "extend", "branch", "extend_run", "branch_run"] as const;
export type RunActionType = (typeof RUN_ACTION_TYPES)[number];

export type RecoveryRecommendation = {
  primary_recommendation: string;
  recommended_actions: string[];
  reasons: string[];
  can_retry_same_plan: boolean;
  can_retry_fallback: boolean;
  can_retry_safer_mode: boolean;
  should_improve_anchors_first: boolean;
  suggested_fallback_provider: string | null;
  suggested_fallback_model: string | null;
  suggested_safer_mode: V2Mode | null;
  action_availability: {
    retry_same_plan: { allowed: boolean; reason: string };
    retry_fallback: { allowed: boolean; reason: string };
    retry_safer_mode: { allowed: boolean; reason: string };
    improve_anchors: { allowed: boolean; reason: string };
  };
};

export type VideoGenerationRunRecord = {
  id: string;
  generation_plan_id: string;
  output_generation_id: string | null;
  mode_selected: V2Mode | string;
  status: VideoRunStatus;
  provider_used: string | null;
  provider_model: string | null;
  run_meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ExecuteVideoRunRequest = {
  generation_plan_id: string;
  selected_pack_id: string;
  mode_selected: V2Mode;
  provider_selected: string;
  model_selected: string;
  director_prompt: string;
  fallback_prompt?: string;
  aspect_ratio: string;
  duration_seconds: number;
  request_payload_snapshot: Record<string, unknown>;
  source_run_id?: string;
  retry_strategy?: RetryStrategy;
  retry_reason?: string;
  action_type?: RunActionType;
  continuation_prompt?: string;
  override_mode?: V2Mode;
  override_provider?: string;
  override_model?: string;
  lineage_meta?: {
    branched_from_run_id?: string;
    branch_type?: "next_shot";
  };
  new_seed?: number;
};

export type ExecuteVideoRunResponse = {
  run: VideoGenerationRunRecord;
  validation?: VideoRunValidationSummary | null;
};

export type VideoRunHistoryRecord = VideoGenerationRunRecord & {
  plan_motion_request?: string | null;
  selected_pack_id?: string | null;
  selected_pack_name?: string | null;
  request_payload_snapshot?: Record<string, unknown> | null;
  output_asset_url?: string | null;
  output_thumbnail_url?: string | null;
  output_generation_status?: string | null;
  file_type?: string | null;
  output_validation?: Record<string, unknown> | null;
  failure_message?: string | null;
  validation?: VideoRunValidationSummary | null;
  retried_from_run_id?: string | null;
  retry_strategy?: RetryStrategy | null;
  retry_reason?: string | null;
  continuation?: boolean;
  source_run_id?: string | null;
  extension_type?: "scene_extension" | null;
  branched_from_run_id?: string | null;
  branch_type?: "next_shot" | null;
  accepted_for_sequence?: boolean;
  continuation_allowed?: boolean;
  continuation_block_reason?: string | null;
  recovery_recommendation?: RecoveryRecommendation | null;
};

export const VIDEO_SEQUENCE_STATUSES = ["draft", "ready", "rendering", "exported", "failed"] as const;
export type VideoSequenceStatus = (typeof VIDEO_SEQUENCE_STATUSES)[number];
export type SequenceRenderStatus = VideoSequenceStatus;

export type RenderMetadata = {
  render_started_at: string;
  render_completed_at: string | null;
  render_duration: number | null;
  render_method: "demuxer" | "filter";
  render_error?: string | null;
  compatibility: {
    codec_match: boolean;
    resolution_match: boolean;
    aspect_ratio_match: boolean;
    fps_match: boolean;
  };
};

export type RenderResult = {
  sequence_id: string;
  status: SequenceRenderStatus;
  output_asset_id: string;
  output_url: string;
  metadata: RenderMetadata;
  message?: string;
};

export type VideoSequence = {
  id: string;
  project_id: string;
  sequence_name: string;
  status: VideoSequenceStatus;
  output_asset_id?: string | null;
  output_url?: string | null;
  sequence_meta?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  clip_count?: number;
};

export type VideoSequenceItem = {
  id: string;
  sequence_id: string;
  run_id: string;
  order_index: number;
  is_active: boolean;
  created_at: string;
};

export type SequenceContinuitySignal = {
  signal: "model" | "garment" | "scene" | "aspect_ratio" | "lineage";
  status: "good" | "warning" | "major_mismatch";
  label: string;
  details: string;
};

export type SequenceTimelineClip = {
  item_id: string;
  run_id: string;
  order_index: number;
  output_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  mode_selected: string;
  provider_model: string | null;
  provider_used: string | null;
  validation_score: number | null;
  accepted_for_sequence: boolean;
  aspect_ratio: string | null;
  selected_pack_id: string | null;
  lineage: {
    extension_from_run_id: string | null;
    branched_from_run_id: string | null;
  };
};

export type SequenceTimelineView = {
  sequence: VideoSequence;
  clips: SequenceTimelineClip[];
  continuity: Array<{
    from_run_id: string;
    to_run_id: string;
    signals: SequenceContinuitySignal[];
    overall: "good" | "warning" | "major_mismatch";
  }>;
};

export type ExportPreparationView = {
  sequence_id: string;
  clips: Array<{
    run_id: string;
    output_url: string | null;
    duration: number | null;
    order_index: number;
  }>;
  total_duration: number;
  ready_for_export: boolean;
  issues: string[];
};

export const AUTO_PRODUCTION_STATUSES = ["planning", "generating", "sequencing", "rendering", "completed", "failed"] as const;
export type AutoProductionStatus = (typeof AUTO_PRODUCTION_STATUSES)[number];

export type AutoProductionControlMode = "safe" | "balanced" | "creative";

export type AutoProductionProgressStep = {
  key: string;
  label: string;
  status: "pending" | "running" | "completed" | "failed";
  note?: string;
};

export type AutoProductionProgress = {
  current_step: string;
  updated_at: string;
  steps: AutoProductionProgressStep[];
  current_shot?: number;
  total_shots?: number;
  shot_logs?: string[];
  input: {
    prompt: string;
    model_id?: string;
    garment_id?: string;
    scene?: string;
    aspect_ratio: string;
    control_mode: AutoProductionControlMode;
  };
  preview: {
    shots: Array<{
      shot_index: number;
      description: string;
      duration: number;
      motion_type: "minimal" | "moderate" | "dynamic";
    }>;
    estimated_duration: number;
    selected_packs: {
      identity_pack_id?: string;
      garment_pack_id?: string;
      scene_pack_id?: string;
    };
    risk_level: "low" | "medium" | "high";
  } | null;
  output_url: string | null;
  error: string | null;
};

export type AutoProductionJob = {
  id: string;
  input_prompt: string;
  status: AutoProductionStatus;
  progress_json: AutoProductionProgress;
  sequence_id: string | null;
  output_asset_id: string | null;
  error_message: string | null;
  created_at: string;
};
