import { truthPriorityScore } from "@/lib/video/v2/skuTruth/ranking";
import type { PackReuseContext, ReuseCandidate, ReuseCandidateRecord, ReuseConfidence } from "@/lib/video/v2/packReuse/types";

const CRITICAL_SYNTHETIC_BLOCK = new Set(["synthesized_support"]);

function normalizeProvenance(
  sourceKind: string,
): "manual_verified_override" | "sku_verified_truth" | "user_uploaded" | "reused_existing" | "expanded_generated" | "synthesized_support" {
  if (sourceKind === "manual_verified_override") return "manual_verified_override";
  if (sourceKind === "sku_verified_truth") return "sku_verified_truth";
  if (sourceKind === "user_uploaded") return "user_uploaded";
  if (sourceKind === "expanded_generated") return "expanded_generated";
  if (sourceKind === "synthesized") return "synthesized_support";
  return "reused_existing";
}

function roleCompatibility(requestedRole: string, candidateRole: string) {
  if (requestedRole === candidateRole) return { score: 20, exact: true, label: "exact role match" };
  if (requestedRole === "three_quarter_side" && ["three_quarter_left", "three_quarter_right"].includes(candidateRole)) {
    return { score: 8, exact: false, label: "compatible three-quarter support role" };
  }
  return { score: 0, exact: false, label: "role mismatch" };
}

function confidenceForScore(score: number): ReuseConfidence {
  if (score >= 85) return "high";
  if (score >= 70) return "medium";
  return "low";
}

export function scoreReuseCandidate(input: {
  context: PackReuseContext;
  role: string;
  candidate: ReuseCandidateRecord;
  critical: boolean;
  recencyRank: number;
}): ReuseCandidate {
  const reasons: string[] = [];
  const { context, role, candidate, critical, recencyRank } = input;

  const identityStrong = candidate.source_profile_id === context.sourceProfileId;
  const garmentStrong = candidate.source_generation_id === context.sourceProfile.primary_generation_id;
  const roleMatch = roleCompatibility(role, candidate.role);
  const provenance = normalizeProvenance(candidate.source_kind);

  let score = 0;

  if (identityStrong) {
    score += 40;
    reasons.push("identity lineage match is exact");
  } else {
    reasons.push("identity lineage mismatch");
  }

  if (garmentStrong) {
    score += 35;
    reasons.push("garment lineage match is exact");
  } else {
    reasons.push("garment lineage cannot be verified as exact");
  }

  score += roleMatch.score;
  reasons.push(roleMatch.label);

  score += truthPriorityScore(provenance) / 5;

  score += Math.max(0, Math.min(5, Number((candidate.quality_score * 5).toFixed(2))));
  score += Math.max(0, 3 - recencyRank);
  score = Number(score.toFixed(2));

  const confidence = confidenceForScore(score);

  const eligible = critical
    ? identityStrong && garmentStrong && roleMatch.exact && confidence !== "low" && !CRITICAL_SYNTHETIC_BLOCK.has(provenance)
    : score >= 65 && roleMatch.score > 0;

  if (critical && provenance === "synthesized_support") reasons.push("critical role blocks synthesized support reuse");
  if (critical && !roleMatch.exact) reasons.push("critical role requires exact role truth");

  return {
    asset_id: candidate.generation_id,
    generation_id: candidate.generation_id,
    role,
    provenance,
    reuse_confidence: confidence,
    score,
    reasons,
    eligible,
    source_item_id: candidate.item_id,
  };
}
