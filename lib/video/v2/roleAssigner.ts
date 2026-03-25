import type { PackReuseCandidate } from "@/lib/video/v2/packReuse";

export type WorkingPackRole = "front" | "fit_anchor" | "three_quarter_left" | "three_quarter_right";

export type AssignedRole = {
  role: WorkingPackRole;
  generation_id: string | null;
  image_url?: string | null;
  source_kind: "reused" | "synthesized";
  confidence_score: number;
  synthetic_prompt?: string;
};

const DEFAULT_ROLES: WorkingPackRole[] = ["front", "fit_anchor", "three_quarter_left", "three_quarter_right"];

export function assignRolesFromCandidates(input: { candidates: PackReuseCandidate[]; motionPrompt: string }) {
  const { candidates, motionPrompt } = input;
  const assigned: AssignedRole[] = [];

  const primary = candidates[0] ?? null;
  if (!primary) {
    return {
      assigned: DEFAULT_ROLES.map((role, index) => ({
        role,
        generation_id: null,
        image_url: null,
        source_kind: "synthesized" as const,
        confidence_score: Number((0.35 - index * 0.03).toFixed(4)),
        synthetic_prompt: `${role} reference synthesized from intent: ${motionPrompt}`,
      })),
      warnings: ["No reusable source generation was found. All roles were synthesized placeholders."],
    };
  }

  assigned.push({ role: "front", generation_id: primary.generation_id, image_url: null, source_kind: "reused", confidence_score: primary.score });
  assigned.push({ role: "fit_anchor", generation_id: primary.generation_id, image_url: null, source_kind: "reused", confidence_score: Number((primary.score - 0.02).toFixed(4)) });

  const sideCandidates = candidates.filter((candidate) => candidate.generation_id !== primary.generation_id);
  const left = sideCandidates[0];
  const right = sideCandidates[1] ?? sideCandidates[0];
  const warnings: string[] = [];

  if (left) {
    assigned.push({ role: "three_quarter_left", generation_id: left.generation_id, image_url: null, source_kind: "reused", confidence_score: left.score });
  } else {
    assigned.push({
      role: "three_quarter_left",
      generation_id: null,
      image_url: null,
      source_kind: "synthesized",
      confidence_score: 0.5,
      synthetic_prompt: `Synthesize three_quarter_left from front source for motion intent: ${motionPrompt}`,
    });
    warnings.push("three_quarter_left was synthesized (no side reuse candidate available).");
  }

  if (right) {
    assigned.push({ role: "three_quarter_right", generation_id: right.generation_id, image_url: null, source_kind: "reused", confidence_score: right.score });
  } else {
    assigned.push({
      role: "three_quarter_right",
      generation_id: null,
      image_url: null,
      source_kind: "synthesized",
      confidence_score: 0.5,
      synthetic_prompt: `Synthesize three_quarter_right from front source for motion intent: ${motionPrompt}`,
    });
    warnings.push("three_quarter_right was synthesized (no side reuse candidate available).");
  }

  return { assigned, warnings };
}
