import type { MotionRiskLevel, VideoInputMode } from "@/lib/video/promptBuilder";

export type ShotType = "establishing" | "motion" | "transition" | "effect";
export type ShotStatus = "planned" | "running" | "completed" | "failed";
export type SequenceStatus = "planned" | "running" | "completed" | "partial-failed" | "failed";
export type StitchStatus = "pending" | "completed" | "failed";

export type VideoShotPlanItem = {
  shotId: string;
  sequenceId: string;
  sequenceIndex: number;
  shotType: ShotType;
  title: string;
  actionPrompt: string;
  invariantsPrompt: string;
  styleHint: string | null;
  targetDurationSeconds: number;
  motionRiskLevel: MotionRiskLevel;
  providerPreference: "conservative" | "motion-strong" | "continuity" | "experimental";
  inputStrategy: VideoInputMode;
  continuityFromShotId?: string | null;
  selectedAnchorIds: string[];
  selectedReferenceSubset: string[];
  status: ShotStatus;
  generatedCandidateIds: string[];
  selectedCandidateId?: string | null;
  stitchedIntoFinalVideo: boolean;
  continuitySource?: {
    type: "anchor-package" | "late-frame";
    sourceShotId?: string;
    frameMarker?: "late";
  } | null;
  diagnostics?: Record<string, unknown>;
};

export type VideoShotCandidate = {
  candidateId: string;
  shotId: string;
  outputUrl: string;
  storagePath: string;
  mimeType: string;
  provider: string;
  backendId: string;
  backendLabel: string;
  backendModel: string;
  providerModelId: string;
  evaluationStatus: "pending" | "completed" | "failed";
  evaluator?: Record<string, unknown>;
  diagnostics: Record<string, unknown>;
};

export type VideoSequenceResult = {
  sequenceId: string;
  originalPrompt: string;
  decompositionEnabled: boolean;
  shotCount: number;
  sequenceStatus: SequenceStatus;
  selectedShotIds: string[];
  selectedCandidatePerShot: Record<string, string | null>;
  stitchedVideoUrl?: string | null;
  stitchedVideoStoragePath?: string | null;
  stitchStatus: StitchStatus;
  stitchedShotOrder: string[];
  stitchDiagnostics: Record<string, unknown>;
  sequenceDiagnostics: Record<string, unknown>;
  providerUsageSummary: Record<string, number>;
  evaluatorSummary?: Record<string, unknown>;
};
