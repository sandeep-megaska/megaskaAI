export type MotionCategory = "micro-motion" | "pose-transition" | "limb-motion" | "interaction-motion" | "sequence-motion";

export type AnchorSuitabilityStatus = "valid" | "weak" | "incompatible";
export type AnchorGapLevel = "low" | "medium" | "high";

export type MotionIntent = {
  motionCategory: MotionCategory;
  primaryAction: string;
  secondaryAction: string | null;
  objectInteraction: string | null;
  sceneInteraction: string | null;
  motionComplexity: "low" | "medium" | "high";
  actionCount: number;
};

export type MotionClassification = {
  motionCategory: MotionCategory;
  motionRiskLevel: "low" | "medium" | "high";
  motionDrivenByAnchorsExpected: boolean;
  expectedAnchorBehavior: string;
  suggestedAnchorPattern: string;
};

export type AnchorGapAnalysis = {
  anchorGapLevel: AnchorGapLevel;
  anchorMotionPatternGuess: string;
  anchorGapWarnings: string[];
};

export type MotionPlan = {
  motionPlanVersion: "anchor-motion-v1";
  protectedCoreFlowEnabled: true;
  motionCategory: MotionCategory;
  primaryAction: string;
  secondaryAction: string | null;
  motionRiskLevel: "low" | "medium" | "high";
  actionCount: number;
  motionDrivenByAnchorsExpected: boolean;
  expectedAnchorBehavior: string;
  suggestedAnchorPattern: string;
  anchorSuitabilityStatus: AnchorSuitabilityStatus;
  motionWarnings: string[];
  anchorGapLevel: AnchorGapLevel;
  anchorMotionPatternGuess: string;
  anchorGapWarnings: string[];
  motionDiagnostics: Record<string, unknown>;
  actionSpecificAnchorRecommended: boolean;
  multiAnchorSequenceRecommended: boolean;
  futureSuggestedAnchorStates: string[];
};
