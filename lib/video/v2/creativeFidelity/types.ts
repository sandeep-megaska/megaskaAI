import type { V2Mode } from "@/lib/video/v2/types";

export type RiskLevel = "low" | "medium" | "high";
export type MotionComplexity = "minimal" | "moderate" | "dynamic";
export type PlannerDecision = "proceed" | "warn" | "block";
export type FidelityTier = "low" | "medium" | "high";

export type CreativeFidelityItem = {
  role: string;
  generation_id: string | null;
  source_kind: string;
};

export type PlanCreativeFidelityInput = {
  clipIntentId: string;
  workingPackId: string;
  motionPrompt: string;
  items: CreativeFidelityItem[];
};

export type ParsedIntentSignals = {
  motionComplexity: MotionComplexity;
  viewDependency: RiskLevel;
  garmentRisk: RiskLevel;
  sceneRisk: RiskLevel;
  hasTurningMotion: boolean;
  hasBackReveal: boolean;
  hasWalkAwayMotion: boolean;
  hasCloseupDetail: boolean;
  hasWaterRotation: boolean;
  waterExposure: boolean;
  surrealExposure: boolean;
  unsafeConcepts: string[];
};

export type RoleCoverage = {
  availableRoles: Set<string>;
  realRoles: Set<string>;
  synthesizedRoles: Set<string>;
  hasFrames: boolean;
};

export type RoleRequirements = {
  requiredRoles: string[];
  missingRoles: string[];
  criticalMissingRoles: string[];
  allowedSynthesisRoles: string[];
};

export type RiskSummary = {
  fidelityTier: FidelityTier;
  motionComplexity: MotionComplexity;
  viewDependency: RiskLevel;
  garmentRisk: RiskLevel;
  sceneRisk: RiskLevel;
  overallRisk: RiskLevel;
  waterExposure: boolean;
  surrealExposure: boolean;
  unsafeConcepts: string[];
};

export type CreativeFidelityPlan = {
  clipIntentId: string;
  workingPackId: string;
  decision: PlannerDecision;
  recommendedMode: V2Mode;
  reasons: string[];
  recommendations: string[];
  warnings: string[];
  riskSummary: RiskSummary;
  requiredRoles: string[];
  missingRoles: string[];
  criticalMissingRoles: string[];
  allowedSynthesisRoles: string[];
};
