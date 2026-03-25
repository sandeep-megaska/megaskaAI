export type FidelityLevel = "low" | "medium" | "high" | "very_high";
export type Decision = "proceed" | "warn" | "block";
export type RecommendedMode = "frames_to_video" | "ingredients_to_video";

export type RiskDimension = {
  level: FidelityLevel;
  score: number;
  reasons: string[];
};

export type PlannerInput = {
  prompt: string;
  aspect_ratio?: string | null;
  duration_seconds?: number | null;
  available_roles: string[];
  role_sources?: Partial<Record<string, "reused" | "synthesized" | "derived">>;
  has_start_frame?: boolean;
  has_end_frame?: boolean;
  garment_type?: string | null;
  scene_type?: string | null;
};

export type ParsedIntentSignals = {
  normalizedPrompt: string;
  motionSignals: string[];
  cameraSignals: string[];
  sceneSignals: string[];
  garmentSignals: string[];
  environmentSignals: string[];
  viewSignals: string[];
};

export type RoleInference = {
  required_roles: string[];
  critical_roles: string[];
};

export type FidelityPlan = {
  motion_complexity: FidelityLevel;
  camera_complexity: FidelityLevel;
  scene_complexity: FidelityLevel;
  garment_risk: FidelityLevel;
  identity_risk: FidelityLevel;
  view_dependency_risk: FidelityLevel;
  environment_risk: FidelityLevel;
  anchor_risk_level: FidelityLevel;

  required_roles: string[];
  available_roles: string[];
  missing_roles: string[];
  critical_missing_roles: string[];

  synthesis_allowed_roles: string[];
  synthesis_blocked_roles: string[];

  decision: Decision;
  recommended_mode: RecommendedMode;

  reasons: string[];
  recommendations: string[];

  summary: {
    total_risk_score: number;
    safe_to_generate: boolean;
    requires_user_attention: boolean;
  };
};
