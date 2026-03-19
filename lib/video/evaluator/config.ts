import type { VideoEvaluatorScoreWeights, VideoEvaluatorThresholds } from "@/lib/video/evaluator/types";

export const VIDEO_EVALUATOR_VERSION = "megaska-evaluator-v1";

export const VIDEO_EVALUATOR_WEIGHTS: VideoEvaluatorScoreWeights = {
  identity: 0.35,
  garment: 0.45,
  scene: 0.2,
};

export const VIDEO_EVALUATOR_THRESHOLDS: VideoEvaluatorThresholds = {
  passOverallMin: 75,
  passGarmentMin: 70,
  reviewOverallMin: 60,
};

export const SAMPLE_FRAME_MARKERS = [
  { label: "early", ratio: 0.15 },
  { label: "middle", ratio: 0.5 },
  { label: "late", ratio: 0.85 },
] as const;

export const EVALUATOR_LOW_CONFIDENCE_STDDEV = 18;
export const MIN_HIGH_CONFIDENCE_FRAMES = 3;
