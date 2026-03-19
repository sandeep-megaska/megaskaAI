import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  colorSimilarityScore,
  cropImage,
  decodeFrameToRgb,
  differenceToScore,
} from "@/lib/video/evaluator/ffmpegMetrics";
import { extractRepresentativeFrames } from "@/lib/video/evaluator/extractVideoFrames";
import {
  EVALUATOR_LOW_CONFIDENCE_STDDEV,
  MIN_HIGH_CONFIDENCE_FRAMES,
  VIDEO_EVALUATOR_THRESHOLDS,
  VIDEO_EVALUATOR_VERSION,
  VIDEO_EVALUATOR_WEIGHTS,
} from "@/lib/video/evaluator/config";
import type {
  AnchorCandidateSource,
  AnchorSelectionInput,
  FrameScore,
  VideoEvaluationCompleted,
  VideoEvaluationFailed,
  VideoEvaluationRecommendation,
  VideoEvaluationResult,
} from "@/lib/video/evaluator/types";

function chooseAnchor(candidates: AnchorCandidateSource[]) {
  return candidates.find((candidate) => Boolean(candidate.url?.trim())) ?? null;
}

function selectAnchors(input: AnchorSelectionInput) {
  const references = input.selectedReferenceSubset?.length ? input.selectedReferenceSubset : input.referenceUrls;
  const firstReference = references?.find((url) => Boolean(url?.trim())) ?? null;

  const identity = chooseAnchor([
    { sourceKey: "identityAnchor", url: input.identityAnchorUrl ?? "" },
    { sourceKey: "fitAnchor", url: input.fitAnchorUrl ?? "" },
    { sourceKey: "firstFrame", url: input.firstFrameUrl ?? "" },
    { sourceKey: "referenceSubset", url: firstReference ?? "" },
  ]);

  const garment = chooseAnchor([
    { sourceKey: "garmentAnchor", url: input.garmentAnchorUrl ?? "" },
    { sourceKey: "fitAnchor", url: input.fitAnchorUrl ?? "" },
    { sourceKey: "firstFrame", url: input.firstFrameUrl ?? "" },
    { sourceKey: "referenceSubset", url: firstReference ?? "" },
  ]);

  const scene = chooseAnchor([
    { sourceKey: "fitAnchor", url: input.fitAnchorUrl ?? "" },
    { sourceKey: "firstFrame", url: input.firstFrameUrl ?? "" },
    { sourceKey: "referenceSubset", url: firstReference ?? "" },
  ]);

  return { identity, garment, scene };
}

function roundScore(value: number) {
  return Math.round(Math.max(0, Math.min(100, value)));
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stddev(values: number[]) {
  if (values.length <= 1) return 0;
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function recommendationFor(overallScore: number, garmentScore: number): VideoEvaluationRecommendation {
  if (overallScore >= VIDEO_EVALUATOR_THRESHOLDS.passOverallMin && garmentScore >= VIDEO_EVALUATOR_THRESHOLDS.passGarmentMin) return "pass";
  if (overallScore >= VIDEO_EVALUATOR_THRESHOLDS.reviewOverallMin) return "review";
  return "fail";
}

async function safeDecodeAnchor(url: string | undefined, diagnosticsKey: string, evaluationDiagnostics: Record<string, unknown>) {
  if (!url) return null;
  try {
    return await decodeFrameToRgb(url, { width: 32, height: 32 });
  } catch (error) {
    evaluationDiagnostics[diagnosticsKey] = error instanceof Error ? error.message : "anchor decode failed";
    return null;
  }
}

export async function runVideoEvaluation(input: {
  videoBytes: Uint8Array;
  anchors: AnchorSelectionInput;
}): Promise<VideoEvaluationResult> {
  const startedAt = Date.now();
  const warnings: string[] = [];
  const evaluationDiagnostics: Record<string, unknown> = {};
  let frameExtractionDiagnostics: Record<string, unknown> = {};
  let tempDir: string | null = null;

  try {
    tempDir = await mkdtemp(join(tmpdir(), "megaska-video-eval-"));
    const videoPath = join(tempDir, `${randomUUID()}.mp4`);
    await writeFile(videoPath, input.videoBytes);

    const extracted = await extractRepresentativeFrames(videoPath);
    frameExtractionDiagnostics = extracted.diagnostics;
    const frames = extracted.frames;

    if (!frames.length) {
      throw new Error("No frames extracted for evaluation");
    }

    if (frames.length < 3) warnings.push("incomplete frame extraction");

    const anchors = selectAnchors(input.anchors);
    const anchorRolesUsed: VideoEvaluationCompleted["anchorRolesUsed"] = {};
    const anchorSourcesUsed: VideoEvaluationCompleted["anchorSourcesUsed"] = {};

    const identityAnchorImage = await safeDecodeAnchor(anchors.identity?.url, "identityAnchorDecodeError", evaluationDiagnostics);
    const garmentAnchorImage = await safeDecodeAnchor(anchors.garment?.url, "garmentAnchorDecodeError", evaluationDiagnostics);
    const sceneAnchorImage = await safeDecodeAnchor(anchors.scene?.url, "sceneAnchorDecodeError", evaluationDiagnostics);

    if (identityAnchorImage && anchors.identity) {
      anchorRolesUsed.identity = "identity";
      anchorSourcesUsed.identity = anchors.identity.sourceKey;
    } else {
      warnings.push("weak anchor quality");
    }

    if (garmentAnchorImage && anchors.garment) {
      anchorRolesUsed.garment = "garment";
      anchorSourcesUsed.garment = anchors.garment.sourceKey;
    } else {
      warnings.push("weak anchor quality");
    }

    if (sceneAnchorImage && anchors.scene) {
      anchorRolesUsed.scene = "scene";
      anchorSourcesUsed.scene = anchors.scene.sourceKey;
    } else {
      warnings.push("weak anchor quality");
    }

    const frameScores: FrameScore[] = frames.map((frame) => {
      const frameImage = { width: frame.width, height: frame.height, pixels: frame.pixels };
      const upperBodyCrop = cropImage(frameImage, 0.2, 0.05, 0.8, 0.55);
      const torsoCrop = cropImage(frameImage, 0.25, 0.25, 0.75, 0.85);

      const identityScore = identityAnchorImage
        ? roundScore((differenceToScore(upperBodyCrop, cropImage(identityAnchorImage, 0.2, 0.05, 0.8, 0.55)) * 0.7) + (colorSimilarityScore(upperBodyCrop, cropImage(identityAnchorImage, 0.2, 0.05, 0.8, 0.55)) * 0.3))
        : 0;
      const garmentScore = garmentAnchorImage
        ? roundScore((differenceToScore(torsoCrop, cropImage(garmentAnchorImage, 0.25, 0.25, 0.75, 0.85)) * 0.55) + (colorSimilarityScore(torsoCrop, cropImage(garmentAnchorImage, 0.25, 0.25, 0.75, 0.85)) * 0.45))
        : 0;
      const sceneScore = sceneAnchorImage
        ? roundScore((differenceToScore(frameImage, sceneAnchorImage) * 0.5) + (colorSimilarityScore(frameImage, sceneAnchorImage) * 0.5))
        : 0;

      return {
        frameLabel: frame.frameLabel,
        timestampSec: frame.timestampSec,
        identityScore,
        garmentScore,
        sceneScore,
      };
    });

    const identityScore = roundScore(average(frameScores.map((frame) => frame.identityScore)));
    const garmentScore = roundScore(average(frameScores.map((frame) => frame.garmentScore)));
    const sceneScore = roundScore(average(frameScores.map((frame) => frame.sceneScore)));

    const overallScore = roundScore(
      identityScore * VIDEO_EVALUATOR_WEIGHTS.identity + garmentScore * VIDEO_EVALUATOR_WEIGHTS.garment + sceneScore * VIDEO_EVALUATOR_WEIGHTS.scene,
    );

    if (garmentScore < 70) warnings.push("likely garment drift");
    if (identityScore < 68) warnings.push("likely identity drift");
    if (sceneScore < 60) warnings.push("likely scene drift");

    const frameOverallStddev = stddev(
      frameScores.map(
        (frame) =>
          frame.identityScore * VIDEO_EVALUATOR_WEIGHTS.identity +
          frame.garmentScore * VIDEO_EVALUATOR_WEIGHTS.garment +
          frame.sceneScore * VIDEO_EVALUATOR_WEIGHTS.scene,
      ),
    );

    let confidence: VideoEvaluationCompleted["confidence"] = "medium";
    if (frames.length < 2 || Object.keys(anchorSourcesUsed).length < 2) confidence = "low";
    if (frames.length >= MIN_HIGH_CONFIDENCE_FRAMES && Object.keys(anchorSourcesUsed).length === 3 && frameOverallStddev < 10) confidence = "high";
    if (frameOverallStddev >= EVALUATOR_LOW_CONFIDENCE_STDDEV) {
      confidence = "low";
      warnings.push("low-confidence evaluation");
    }

    const recommendation = recommendationFor(overallScore, garmentScore);

    evaluationDiagnostics.frameScores = frameScores;
    evaluationDiagnostics.frameOverallStddev = Number(frameOverallStddev.toFixed(2));

    return {
      evaluatorVersion: VIDEO_EVALUATOR_VERSION,
      evaluationStatus: "completed",
      overallScore,
      identityScore,
      garmentScore,
      sceneScore,
      confidence,
      recommendation,
      warnings: Array.from(new Set(warnings)),
      scoringWeights: VIDEO_EVALUATOR_WEIGHTS,
      thresholdsUsed: VIDEO_EVALUATOR_THRESHOLDS,
      extractedFrameCount: frames.length,
      anchorRolesUsed,
      anchorSourcesUsed,
      frameExtractionDiagnostics,
      evaluationDiagnostics,
      evaluatorRuntimeMs: Date.now() - startedAt,
    } satisfies VideoEvaluationCompleted;
  } catch (error) {
    return {
      evaluatorVersion: VIDEO_EVALUATOR_VERSION,
      evaluationStatus: "failed",
      warnings: Array.from(new Set(["Evaluation unavailable for this result", ...warnings])),
      frameExtractionDiagnostics,
      evaluationDiagnostics: {
        ...evaluationDiagnostics,
        error: error instanceof Error ? error.message : "unknown evaluation failure",
      },
      evaluatorRuntimeMs: Date.now() - startedAt,
    } satisfies VideoEvaluationFailed;
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}
