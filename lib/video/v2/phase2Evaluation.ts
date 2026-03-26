export const PHASE2_EVALUATION_MODE = "phase2" as const;

export const PHASE2_TEMPLATE_IDS = [
  "front_premium_hold",
  "front_to_slight_three_quarter",
  "front_walk_in_place_illusion",
  "detail_close_up_motion",
  "verified_back_hold",
] as const;

export type Phase2TemplateId = (typeof PHASE2_TEMPLATE_IDS)[number];
export type Phase2Verdict = "pass" | "soft_fail" | "hard_fail";
export type Phase2RetryRecommendation = "no_retry" | "retry_one_change" | "approve_template" | "pause_template";

export type Phase2EvaluationInput = {
  template_id: string;
  garment_truth_ok: boolean;
  identity_stable: boolean;
  motion_within_template: boolean;
  commercially_usable: boolean;
  reviewer_notes?: string | null;
  verdict?: Phase2Verdict;
};

export type Phase2EvaluationRecord = {
  evaluation_mode: "phase2";
  template_id: string;
  garment_truth_ok: boolean;
  identity_stable: boolean;
  motion_within_template: boolean;
  commercially_usable: boolean;
  verdict: Phase2Verdict;
  reviewer_notes: string | null;
  retry_recommendation: Phase2RetryRecommendation;
  evaluated_at: string;
};

export type Phase2TemplateHealthSummary = {
  passes: number;
  soft_fails: number;
  hard_fails: number;
  geometry_hard_fails: number;
  should_approve_template: boolean;
  should_pause_template: boolean;
};

export function isPhase2TemplateId(value: string | null | undefined): value is Phase2TemplateId {
  return Boolean(value && (PHASE2_TEMPLATE_IDS as readonly string[]).includes(value));
}

export function classifyPhase2Verdict(input: Omit<Phase2EvaluationInput, "reviewer_notes" | "template_id" | "verdict">): Phase2Verdict {
  if (!input.garment_truth_ok || !input.identity_stable || !input.motion_within_template) return "hard_fail";
  if (!input.commercially_usable) return "soft_fail";
  return "pass";
}

export function summarizePhase2TemplateHealth(records: Array<Pick<Phase2EvaluationRecord, "verdict" | "garment_truth_ok">>): Phase2TemplateHealthSummary {
  const passes = records.filter((record) => record.verdict === "pass").length;
  const soft_fails = records.filter((record) => record.verdict === "soft_fail").length;
  const hard_fails = records.filter((record) => record.verdict === "hard_fail").length;
  const geometry_hard_fails = records.filter((record) => record.verdict === "hard_fail" && !record.garment_truth_ok).length;
  const sampleSize = Math.min(5, records.length);
  const should_approve_template = sampleSize >= 5 && passes >= 3 && geometry_hard_fails === 0;
  const should_pause_template = hard_fails >= 2;
  return {
    passes,
    soft_fails,
    hard_fails,
    geometry_hard_fails,
    should_approve_template,
    should_pause_template,
  };
}

export function buildPhase2RetryRecommendation(input: { verdict: Phase2Verdict; health: Phase2TemplateHealthSummary }): Phase2RetryRecommendation {
  if (input.health.should_pause_template) return "pause_template";
  if (input.health.should_approve_template) return "approve_template";
  if (input.verdict === "pass") return "no_retry";
  return "retry_one_change";
}

export function buildPhase2EvaluationRecord(input: Phase2EvaluationInput & { health: Phase2TemplateHealthSummary; now?: Date }): Phase2EvaluationRecord {
  const verdict = classifyPhase2Verdict(input);
  return {
    evaluation_mode: PHASE2_EVALUATION_MODE,
    template_id: input.template_id,
    garment_truth_ok: Boolean(input.garment_truth_ok),
    identity_stable: Boolean(input.identity_stable),
    motion_within_template: Boolean(input.motion_within_template),
    commercially_usable: Boolean(input.commercially_usable),
    verdict,
    reviewer_notes: typeof input.reviewer_notes === "string" && input.reviewer_notes.trim() ? input.reviewer_notes.trim() : null,
    retry_recommendation: buildPhase2RetryRecommendation({ verdict, health: input.health }),
    evaluated_at: (input.now ?? new Date()).toISOString(),
  };
}

export function parsePhase2Evaluation(value: unknown): Phase2EvaluationRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.evaluation_mode !== "phase2") return null;
  if (typeof record.template_id !== "string") return null;
  if (record.verdict !== "pass" && record.verdict !== "soft_fail" && record.verdict !== "hard_fail") return null;
  return {
    evaluation_mode: "phase2",
    template_id: record.template_id,
    garment_truth_ok: Boolean(record.garment_truth_ok),
    identity_stable: Boolean(record.identity_stable),
    motion_within_template: Boolean(record.motion_within_template),
    commercially_usable: Boolean(record.commercially_usable),
    verdict: record.verdict,
    reviewer_notes: typeof record.reviewer_notes === "string" ? record.reviewer_notes : null,
    retry_recommendation: record.retry_recommendation === "approve_template" || record.retry_recommendation === "pause_template" || record.retry_recommendation === "retry_one_change" ? record.retry_recommendation : "no_retry",
    evaluated_at: typeof record.evaluated_at === "string" ? record.evaluated_at : new Date(0).toISOString(),
  };
}
