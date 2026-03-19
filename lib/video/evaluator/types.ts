export type VideoEvaluationStatus = "pending" | "completed" | "failed";
export type VideoEvaluationRecommendation = "pass" | "review" | "fail";
export type VideoEvaluationConfidence = "low" | "medium" | "high";

export type VideoEvaluatorScoreWeights = {
  identity: number;
  garment: number;
  scene: number;
};

export type VideoEvaluatorThresholds = {
  passOverallMin: number;
  passGarmentMin: number;
  reviewOverallMin: number;
};

export type VideoAnchorRole = "identity" | "garment" | "scene";

export type AnchorCandidateSource = {
  sourceKey: string;
  url: string;
};

export type AnchorSelectionInput = {
  identityAnchorUrl?: string | null;
  garmentAnchorUrl?: string | null;
  fitAnchorUrl?: string | null;
  firstFrameUrl?: string | null;
  selectedReferenceSubset?: string[] | null;
  referenceUrls?: string[] | null;
};

export type FrameScore = {
  frameLabel: "early" | "middle" | "late";
  timestampSec: number;
  identityScore: number;
  garmentScore: number;
  sceneScore: number;
};

export type VideoEvaluationCompleted = {
  evaluatorVersion: string;
  evaluationStatus: "completed";
  overallScore: number;
  identityScore: number;
  garmentScore: number;
  sceneScore: number;
  confidence: VideoEvaluationConfidence;
  recommendation: VideoEvaluationRecommendation;
  warnings: string[];
  scoringWeights: VideoEvaluatorScoreWeights;
  thresholdsUsed: VideoEvaluatorThresholds;
  extractedFrameCount: number;
  anchorRolesUsed: Partial<Record<VideoAnchorRole, string>>;
  anchorSourcesUsed: Partial<Record<VideoAnchorRole, string>>;
  frameExtractionDiagnostics: Record<string, unknown>;
  evaluationDiagnostics: Record<string, unknown>;
  evaluatorRuntimeMs: number;
};

export type VideoEvaluationFailed = {
  evaluatorVersion: string;
  evaluationStatus: "failed";
  warnings: string[];
  frameExtractionDiagnostics: Record<string, unknown>;
  evaluationDiagnostics: Record<string, unknown>;
  evaluatorRuntimeMs: number;
};

export type VideoEvaluationResult = VideoEvaluationCompleted | VideoEvaluationFailed;
