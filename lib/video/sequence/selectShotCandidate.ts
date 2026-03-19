import type { VideoShotCandidate } from "@/lib/video/sequence/types";

function readOverallScore(candidate: VideoShotCandidate) {
  const evaluator = candidate.evaluator as { overallScore?: unknown; recommendation?: unknown } | undefined;
  const score = typeof evaluator?.overallScore === "number" ? evaluator.overallScore : null;
  const recommendation = typeof evaluator?.recommendation === "string" ? evaluator.recommendation : null;
  const recommendationBoost = recommendation === "pass" ? 5 : recommendation === "review" ? 1 : 0;
  return (score ?? 0) + recommendationBoost;
}

export function selectShotCandidate(candidates: VideoShotCandidate[]): VideoShotCandidate | null {
  if (!candidates.length) return null;
  return candidates.slice().sort((a, b) => readOverallScore(b) - readOverallScore(a))[0] ?? candidates[0] ?? null;
}
