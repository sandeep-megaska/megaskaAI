import type { MotionComplexity as PlannerMotionComplexity, RiskLevel } from "@/lib/video/v2/creativeFidelity/types";

export type GarmentRiskTier = "tier1" | "tier2" | "tier3";
export type GarmentSilhouetteClass = "fitted" | "a_line" | "modest" | "layered" | "structured" | "flowy";
export type GarmentCoverageClass = "low" | "medium" | "high" | "full";

export type CanonicalTruthAsset = {
  role: string;
  generationId: string;
  sourceKind: string;
  isVerified: boolean;
  confidenceScore?: number;
};

export type GarmentConstitution = {
  skuCode: string;
  riskTier: GarmentRiskTier;
  silhouetteClass: GarmentSilhouetteClass;
  coverageClass: GarmentCoverageClass;
  canonicalTruthAssets: CanonicalTruthAsset[];
  geometryRules: string[];
  designPreservationRules: string[];
  toleranceRules: {
    hemLengthDeltaPctMax: number;
    necklineDeltaPctMax: number;
    printDriftPctMax: number;
    silhouetteVariancePctMax: number;
  };
  forbiddenTransformations: string[];
  notes?: string[];
};

export type GovernanceAnchorRole = {
  role: string;
  sourceKind: string;
  isVerified: boolean;
};

export type GovernanceMotionComplexity = PlannerMotionComplexity | "low" | "medium" | "high";

export type TruthDebtInput = {
  startState: string | null;
  endState: string | null;
  garmentRiskTier: GarmentRiskTier;
  silhouetteClass: GarmentSilhouetteClass;
  coverageClass: GarmentCoverageClass;
  motionComplexity: GovernanceMotionComplexity;
  cameraComplexity: "static" | "simple" | "cinematic";
  availableAnchors: GovernanceAnchorRole[];
  hasTransitionTruth: boolean;
  backRevealRequested: boolean;
  silhouetteRisk: RiskLevel;
  printContinuityRisk: RiskLevel;
};

export type TruthDebtLevel = "low" | "medium" | "high" | "critical";
export type TruthDebtDecision = "allow" | "allow_with_warning" | "downgrade" | "block";

export type TruthDebtResult = {
  totalScore: number;
  debtLevel: TruthDebtLevel;
  decision: TruthDebtDecision;
  missingAnchorRoles: string[];
  requiredNextAnchors: string[];
  downgradeRecommendation: string | null;
  reasons: string[];
  warnings: string[];
};

export type JudgeViolationCode =
  | "hem_shortened"
  | "back_redesigned"
  | "silhouette_collapse"
  | "added_skin_exposure"
  | "neckline_deepened"
  | "layer_loss"
  | "panel_loss"
  | "print_drift"
  | "strap_mutation"
  | "identity_drift"
  | "motion_violation"
  | "camera_violation";

export type JudgeSeverity = "low" | "medium" | "high" | "critical";
export type JudgeOutcome = "pass" | "salvageable" | "reject";

export type JudgeViolation = {
  code: JudgeViolationCode;
  severity: JudgeSeverity;
  segmentId?: string | null;
  message: string;
};

export type JudgeSalvageAction =
  | "retry_segment_only"
  | "reduce_motion_and_retry"
  | "trim_clip"
  | "freeze_frame_as_image"
  | "promote_frame_to_anchor"
  | "reject_fully";

export type JudgeSegmentInput = {
  segmentId: string;
  fidelityScore: number;
  violations: JudgeViolation[];
};

export type JudgePassInput = {
  clipIntentId: string;
  garment: Pick<GarmentConstitution, "riskTier" | "silhouetteClass" | "coverageClass">;
  overallFidelityScore: number;
  segments?: JudgeSegmentInput[];
  violations: JudgeViolation[];
};

export type JudgePassResult = {
  outcome: JudgeOutcome;
  garmentFidelityScore: number;
  violations: JudgeViolation[];
  salvageActions: JudgeSalvageAction[];
  reasons: string[];
  segmentResults: Array<{
    segmentId: string;
    outcome: JudgeOutcome;
    fidelityScore: number;
    violations: JudgeViolation[];
  }>;
};
