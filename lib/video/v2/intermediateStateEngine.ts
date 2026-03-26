import { parseIntentSignals } from "@/lib/video/v2/creativeFidelity/intentParser";
import type { RiskLevel } from "@/lib/video/v2/creativeFidelity/types";

export const TRANSITION_STATE_LABELS = [
  "front",
  "three_quarter_left",
  "three_quarter_right",
  "side_left",
  "side_right",
  "mid_turn_left",
  "mid_turn_right",
  "back",
  "detail",
] as const;

export type TransitionStateLabel = (typeof TRANSITION_STATE_LABELS)[number];

export type TransitionSourceKind =
  | "sku_verified_truth"
  | "manual_verified_override"
  | "reused_existing"
  | "expanded_generated"
  | "synthesized_support"
  | "user_uploaded"
  | "unknown";

export type IntermediateStateInput = {
  id: string;
  role: string;
  generation_id: string | null;
  source_kind: string;
  confidence_score?: number | null;
  sort_order?: number | null;
  item_meta?: Record<string, unknown> | null;
};

export type TransitionVisualState = {
  state_id: string;
  clip_intent_id: string;
  state_label: TransitionStateLabel;
  role: string;
  source_kind: TransitionSourceKind;
  generation_id: string;
  sequence_index: number;
  is_verified: boolean;
  confidence_score: number;
  created_at: string;
};

export type TransitionSegment = {
  segment_id: string;
  sequence_index: number;
  from_state_id: string;
  to_state_id: string;
  from_label: TransitionStateLabel;
  to_label: TransitionStateLabel;
  from_generation_id: string;
  to_generation_id: string;
  status: "ready" | "blocked";
  reason: string;
  prompt_hint: string;
};

export type TransitionPlanStrategy = "not_applicable" | "direct" | "segmented" | "blocked_missing_intermediate";

export type TransitionCoverage = "none" | "partial" | "complete";

export type TransitionPlan = {
  strategy: TransitionPlanStrategy;
  coverage: TransitionCoverage;
  direct_transition_allowed: boolean;
  direct_transition_discouraged: boolean;
  intermediate_state_required: boolean;
  intermediate_state_recommended: boolean;
  target_direction: "front_to_back" | "back_to_front" | "other";
  states: TransitionVisualState[];
  planned_sequence: TransitionStateLabel[];
  missing_state_labels: TransitionStateLabel[];
  segments: TransitionSegment[];
  reasons: string[];
  recommendations: string[];
};

const VERIFIED_SOURCES = new Set(["sku_verified_truth", "manual_verified_override"]);
const SOURCE_PRIORITY: Record<string, number> = {
  manual_verified_override: 120,
  sku_verified_truth: 115,
  user_uploaded: 100,
  reused_existing: 90,
  expanded_generated: 80,
  synthesized_support: 70,
  synthesized: 60,
};

function normalizeSourceKind(sourceKind: string): TransitionSourceKind {
  const value = String(sourceKind || "").trim().toLowerCase();
  if (value === "sku_verified_truth" || value === "manual_verified_override" || value === "reused_existing" || value === "expanded_generated" || value === "synthesized_support" || value === "user_uploaded") {
    return value;
  }
  return "unknown";
}

function resolveStateLabel(role: string): TransitionStateLabel | null {
  const normalized = String(role || "").trim().toLowerCase();
  if ((TRANSITION_STATE_LABELS as readonly string[]).includes(normalized)) return normalized as TransitionStateLabel;
  if (normalized === "left_profile") return "side_left";
  if (normalized === "right_profile") return "side_right";
  return null;
}

function getDirectionFromPrompt(prompt: string): TransitionPlan["target_direction"] {
  const normalized = prompt.toLowerCase();
  if (/\b(back\s*to\s*front|rear\s*to\s*front|from behind to front)\b/.test(normalized)) return "back_to_front";
  if (/\b(front\s*to\s*back|turn\s*to\s*back|show\s*the\s*back|back\s*design|rear\s*reveal|walk\s*away)\b/.test(normalized)) return "front_to_back";
  return "other";
}

function inferGarmentRisk(prompt: string, base: RiskLevel): RiskLevel {
  const normalized = prompt.toLowerCase();
  const modestKeywords = /\b(modest|frock|layered|loose|complex back|structured back|coverage)\b/.test(normalized);
  if (base === "high" || modestKeywords) return "high";
  if (base === "medium") return "medium";
  return "low";
}

function rankCandidate(item: IntermediateStateInput) {
  const sourceScore = SOURCE_PRIORITY[String(item.source_kind ?? "").toLowerCase()] ?? 30;
  const confidence = Math.max(0, Math.min(1, Number(item.confidence_score ?? 0)));
  const sort = Number(item.sort_order ?? 0);
  return sourceScore + confidence + sort / 1000;
}

function buildPromptHint(fromLabel: TransitionStateLabel, toLabel: TransitionStateLabel) {
  return [
    `Slow controlled transition from verified ${fromLabel} state to verified ${toLabel} state.`,
    "Preserve exact garment shape, coverage, and print alignment throughout the transition.",
    "Final state must match the provided end-frame anchor exactly.",
  ].join(" ");
}

function selectBestState(clipIntentId: string, stateLabel: TransitionStateLabel, items: IntermediateStateInput[]): TransitionVisualState | null {
  const candidates = items
    .filter((item) => item.generation_id)
    .map((item) => ({ item, label: resolveStateLabel(item.role) }))
    .filter((entry): entry is { item: IntermediateStateInput; label: TransitionStateLabel } => entry.label === stateLabel)
    .sort((a, b) => rankCandidate(b.item) - rankCandidate(a.item));

  const selected = candidates[0]?.item;
  if (!selected?.generation_id) return null;

  return {
    state_id: `${clipIntentId}:${stateLabel}:${selected.id}`,
    clip_intent_id: clipIntentId,
    state_label: stateLabel,
    role: selected.role,
    source_kind: normalizeSourceKind(selected.source_kind),
    generation_id: selected.generation_id,
    sequence_index: 0,
    is_verified: VERIFIED_SOURCES.has(String(selected.source_kind).toLowerCase()),
    confidence_score: Number(selected.confidence_score ?? 0),
    created_at: new Date().toISOString(),
  };
}

function chooseIntermediateLabel(direction: TransitionPlan["target_direction"], prompt: string, available: Set<TransitionStateLabel>): TransitionStateLabel | null {
  const normalized = prompt.toLowerCase();
  const preferRight = /\b(right|clockwise|turn right)\b/.test(normalized);
  const preferLeft = /\b(left|counterclockwise|turn left)\b/.test(normalized);

  const directionalPriority: TransitionStateLabel[] = direction === "back_to_front"
    ? ["mid_turn_left", "mid_turn_right", "three_quarter_left", "three_quarter_right", "side_left", "side_right"]
    : ["mid_turn_left", "mid_turn_right", "three_quarter_left", "three_quarter_right", "side_left", "side_right"];

  if (preferLeft) {
    directionalPriority.unshift("mid_turn_left", "three_quarter_left", "side_left");
  }
  if (preferRight) {
    directionalPriority.unshift("mid_turn_right", "three_quarter_right", "side_right");
  }

  for (const label of directionalPriority) {
    if (available.has(label)) return label;
  }

  return null;
}

export function buildTransitionPlan(input: {
  clipIntentId: string;
  motionPrompt: string;
  items: IntermediateStateInput[];
  garmentRisk: RiskLevel;
  allowDirectFrontBack: boolean;
}): TransitionPlan {
  const signals = parseIntentSignals(input.motionPrompt);
  const direction = getDirectionFromPrompt(input.motionPrompt);
  const effectiveGarmentRisk = inferGarmentRisk(input.motionPrompt, input.garmentRisk);
  const isRevealFlow = direction !== "other" || signals.hasTurningMotion || signals.hasBackReveal || signals.hasWalkAwayMotion;

  const front = selectBestState(input.clipIntentId, "front", input.items);
  const back = selectBestState(input.clipIntentId, "back", input.items);
  const quarterLeft = selectBestState(input.clipIntentId, "three_quarter_left", input.items);
  const quarterRight = selectBestState(input.clipIntentId, "three_quarter_right", input.items);
  const sideLeft = selectBestState(input.clipIntentId, "side_left", input.items);
  const sideRight = selectBestState(input.clipIntentId, "side_right", input.items);
  const midLeft = selectBestState(input.clipIntentId, "mid_turn_left", input.items);
  const midRight = selectBestState(input.clipIntentId, "mid_turn_right", input.items);

  const byLabel = new Map<TransitionStateLabel, TransitionVisualState>();
  for (const state of [front, back, quarterLeft, quarterRight, sideLeft, sideRight, midLeft, midRight]) {
    if (state) byLabel.set(state.state_label, state);
  }

  if (!isRevealFlow) {
    const states = Array.from(byLabel.values()).map((state, index) => ({ ...state, sequence_index: index }));
    return {
      strategy: "not_applicable",
      coverage: states.length ? "complete" : "none",
      direct_transition_allowed: true,
      direct_transition_discouraged: false,
      intermediate_state_required: false,
      intermediate_state_recommended: false,
      target_direction: direction,
      states,
      planned_sequence: [],
      missing_state_labels: [],
      segments: [],
      reasons: ["Motion intent does not require a multi-anchor transition plan."],
      recommendations: [],
    };
  }

  const reasons: string[] = [];
  const recommendations: string[] = [];

  const endpoints = direction === "back_to_front" ? { start: back, end: front, startLabel: "back" as const, endLabel: "front" as const } : { start: front, end: back, startLabel: "front" as const, endLabel: "back" as const };

  const availableLabels = new Set(byLabel.keys());
  const intermediate = chooseIntermediateLabel(direction, input.motionPrompt, availableLabels);

  const needsIntermediate = effectiveGarmentRisk === "high" || signals.hasBackReveal || signals.hasWalkAwayMotion || signals.hasTurningMotion;
  const directDiscouraged = needsIntermediate;

  const missingStateLabels: TransitionStateLabel[] = [];
  if (!endpoints.start) missingStateLabels.push(endpoints.startLabel);
  if (!endpoints.end) missingStateLabels.push(endpoints.endLabel);

  if (needsIntermediate && !intermediate) {
    missingStateLabels.push(direction === "back_to_front" ? "mid_turn_left" : "mid_turn_left");
    reasons.push("Large view-jump reveal detected with no approved intermediate anchor state.");
    recommendations.push("Generate or approve a three-quarter or mid-turn state via Image Project and attach it as SKU truth before compile.");
  }

  if (effectiveGarmentRisk === "high") {
    reasons.push("Garment risk is high (modest/layered/complex structure), so large rotation jumps are discouraged.");
  }

  const sequence: TransitionStateLabel[] = [];
  if (endpoints.start) sequence.push(endpoints.start.state_label);
  if (intermediate) sequence.push(intermediate);
  if (endpoints.end) sequence.push(endpoints.end.state_label);

  const sequencedStates = sequence
    .map((label) => byLabel.get(label))
    .filter((state): state is TransitionVisualState => Boolean(state))
    .map((state, index) => ({ ...state, sequence_index: index }));

  const segments: TransitionSegment[] = [];
  for (let i = 0; i < sequencedStates.length - 1; i += 1) {
    const from = sequencedStates[i];
    const to = sequencedStates[i + 1];
    segments.push({
      segment_id: `${input.clipIntentId}:segment:${i + 1}`,
      sequence_index: i,
      from_state_id: from.state_id,
      to_state_id: to.state_id,
      from_label: from.state_label,
      to_label: to.state_label,
      from_generation_id: from.generation_id,
      to_generation_id: to.generation_id,
      status: "ready",
      reason: "Adjacent transition segment is ready.",
      prompt_hint: buildPromptHint(from.state_label, to.state_label),
    });
  }

  if (missingStateLabels.length) {
    return {
      strategy: needsIntermediate && !input.allowDirectFrontBack ? "blocked_missing_intermediate" : "direct",
      coverage: endpoints.start && endpoints.end ? "partial" : "none",
      direct_transition_allowed: input.allowDirectFrontBack,
      direct_transition_discouraged: directDiscouraged,
      intermediate_state_required: needsIntermediate && !input.allowDirectFrontBack,
      intermediate_state_recommended: needsIntermediate,
      target_direction: direction,
      states: sequencedStates,
      planned_sequence: sequence,
      missing_state_labels: Array.from(new Set(missingStateLabels)),
      segments,
      reasons,
      recommendations,
    };
  }

  if (needsIntermediate && intermediate && segments.length >= 2) {
    reasons.push(`Using segmented transition through ${intermediate} to reduce geometry hallucination.`);
    return {
      strategy: "segmented",
      coverage: "complete",
      direct_transition_allowed: input.allowDirectFrontBack,
      direct_transition_discouraged: true,
      intermediate_state_required: false,
      intermediate_state_recommended: true,
      target_direction: direction,
      states: sequencedStates,
      planned_sequence: sequence,
      missing_state_labels: [],
      segments,
      reasons,
      recommendations,
    };
  }

  reasons.push("Direct transition is acceptable for this intent and available state coverage.");
  return {
    strategy: "direct",
    coverage: "complete",
    direct_transition_allowed: true,
    direct_transition_discouraged: directDiscouraged,
    intermediate_state_required: false,
    intermediate_state_recommended: needsIntermediate,
    target_direction: direction,
    states: sequencedStates,
    planned_sequence: sequence,
    missing_state_labels: [],
    segments,
    reasons,
    recommendations,
  };
}

export type CompiledTransitionSegment = {
  segment_id: string;
  sequence_index: number;
  mode_selected: "frames_to_video";
  start_frame_generation_id: string;
  end_frame_generation_id: string;
  start_state_label: TransitionStateLabel;
  end_state_label: TransitionStateLabel;
  director_prompt: string;
};

export function compileTransitionSegments(plan: TransitionPlan): CompiledTransitionSegment[] {
  return plan.segments
    .filter((segment) => segment.status === "ready")
    .map((segment) => ({
      segment_id: segment.segment_id,
      sequence_index: segment.sequence_index,
      mode_selected: "frames_to_video",
      start_frame_generation_id: segment.from_generation_id,
      end_frame_generation_id: segment.to_generation_id,
      start_state_label: segment.from_label,
      end_state_label: segment.to_label,
      director_prompt: segment.prompt_hint,
    }));
}
