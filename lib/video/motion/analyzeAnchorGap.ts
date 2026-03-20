import type { AnchorGapAnalysis } from "@/lib/video/motion/types";

type AnalyzeAnchorGapInput = {
  firstFrameUrl?: string | null;
  lastFrameUrl?: string | null;
  firstFrameGenerationId?: string | null;
  lastFrameGenerationId?: string | null;
};

function normalizeUrlForComparison(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return trimmed.split(/[?#]/, 1)[0] ?? trimmed;
  }
}

function extractPoseToken(url?: string | null) {
  const text = (url ?? "").toLowerCase();
  if (text.includes("front")) return "front";
  if (text.includes("back")) return "back";
  if (text.includes("side") || text.includes("profile")) return "side";
  return "unknown";
}

export function analyzeAnchorGap(input: AnalyzeAnchorGapInput): AnchorGapAnalysis {
  const firstNormalized = normalizeUrlForComparison(input.firstFrameUrl);
  const lastNormalized = normalizeUrlForComparison(input.lastFrameUrl);
  const warnings: string[] = [];

  if (!firstNormalized || !lastNormalized) {
    return {
      anchorGapLevel: "high",
      anchorMotionPatternGuess: "insufficient-anchor-data",
      anchorGapWarnings: ["Missing first/last anchor for gap diagnosis."],
    };
  }

  if (firstNormalized === lastNormalized || (input.firstFrameGenerationId && input.firstFrameGenerationId === input.lastFrameGenerationId)) {
    warnings.push("Anchor gap appears very small; generated motion may be minimal.");
    return {
      anchorGapLevel: "low",
      anchorMotionPatternGuess: "same-or-near-identical-anchor",
      anchorGapWarnings: warnings,
    };
  }

  const firstPose = extractPoseToken(firstNormalized);
  const lastPose = extractPoseToken(lastNormalized);

  if ((firstPose === "front" && lastPose === "back") || (firstPose === "back" && lastPose === "front")) {
    warnings.push("Large front-to-back anchor gap may dominate the result.");
    return {
      anchorGapLevel: "high",
      anchorMotionPatternGuess: "strong-front-to-back-change",
      anchorGapWarnings: warnings,
    };
  }

  if (firstPose !== "unknown" && lastPose !== "unknown" && firstPose === lastPose) {
    return {
      anchorGapLevel: "medium",
      anchorMotionPatternGuess: "similar-pose-family",
      anchorGapWarnings: warnings,
    };
  }

  warnings.push("Anchor pair may encode generic interpolation more than action-specific states.");
  return {
    anchorGapLevel: "medium",
    anchorMotionPatternGuess: "generic-transition-likely",
    anchorGapWarnings: warnings,
  };
}
