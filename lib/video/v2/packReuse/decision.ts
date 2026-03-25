import type { RoleReuseDecision, ReuseCandidate } from "@/lib/video/v2/packReuse/types";

export function chooseRoleReuseDecision(input: {
  role: string;
  candidates: ReuseCandidate[];
  critical: boolean;
}): RoleReuseDecision {
  const sorted = [...input.candidates].sort((a, b) => (b.score - a.score) || a.asset_id.localeCompare(b.asset_id));
  const chosen = sorted.find((candidate) => candidate.eligible) ?? null;

  if (chosen) {
    return {
      role: input.role,
      candidates: sorted,
      chosen_candidate: chosen,
      decision: "reuse",
      reason: `Reusing highest-confidence ${input.role} anchor candidate.`,
    };
  }

  return {
    role: input.role,
    candidates: sorted,
    chosen_candidate: null,
    decision: input.critical ? "fallback_to_expand" : "skip",
    reason: input.candidates.length
      ? "No eligible reusable truth met deterministic reuse thresholds."
      : "No reusable truth candidates were found for this role.",
  };
}
