import type { GarmentRiskTier, JudgeSalvageAction, JudgeSeverity, TruthDebtDecision, TruthDebtLevel } from "@/lib/video/v2/governance/types";

export const VERIFIED_TRUTH_SOURCE_KINDS = new Set(["sku_verified_truth", "manual_verified_override"]);

export const TRUTH_DEBT_THRESHOLDS: Record<TruthDebtLevel, number> = {
  low: 20,
  medium: 45,
  high: 70,
  critical: 100,
};

export const TRUTH_DEBT_DECISION_BY_LEVEL: Record<TruthDebtLevel, TruthDebtDecision> = {
  low: "allow",
  medium: "allow_with_warning",
  high: "downgrade",
  critical: "block",
};

export const GARMENT_RISK_TIER_SCORE: Record<GarmentRiskTier, number> = {
  tier1: 8,
  tier2: 18,
  tier3: 32,
};

export const JUDGE_SEVERITY_SCORE: Record<JudgeSeverity, number> = {
  low: 8,
  medium: 20,
  high: 40,
  critical: 70,
};

export const DEFAULT_FORBIDDEN_TRANSFORMS = [
  "shorten_hem",
  "deepen_neckline",
  "remove_layer",
  "change_back_design",
  "mutate_strap_topology",
  "erase_paneling",
] as const;

export const SALVAGE_ACTIONS_BY_SEVERITY: Record<JudgeSeverity, JudgeSalvageAction[]> = {
  low: ["trim_clip", "promote_frame_to_anchor"],
  medium: ["retry_segment_only", "trim_clip"],
  high: ["reduce_motion_and_retry", "retry_segment_only"],
  critical: ["reject_fully"],
};
