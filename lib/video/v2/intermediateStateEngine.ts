import { parseIntentSignals } from "@/lib/video/v2/creativeFidelity/intentParser";
import type { RiskLevel } from "@/lib/video/v2/creativeFidelity/types";

export const VIDEO_STATES = [
  "front",
  "three_quarter_left",
  "three_quarter_right",
  "side_left",
  "side_right",
  "mid_turn_left",
  "mid_turn_right",
  "back",
  "detail",
  "fit_anchor",
  "start_frame",
  "end_frame",
] as const;

export type VideoState = (typeof VIDEO_STATES)[number];
export type TransitionStateLabel = VideoState;

export type RiskTier = "tier1_safe" | "tier2_medium" | "tier3_high";
export type MotionComplexity = "low" | "medium" | "high";

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
  duration_seconds: number;
  required_anchor_roles: VideoState[];
};

export type TransitionPlanStrategy = "not_applicable" | "direct" | "segmented" | "blocked_missing_intermediate";
export type TransitionCoverage = "none" | "partial" | "complete";

export type StatePathCompilerOutput = {
  strategy: "direct_transition" | "segmented_transition";
  statePath: VideoState[];
  warnings: string[];
  blockedReasons: string[];
};

export type CompiledVideoPlan = {
  strategy: "direct_transition" | "segmented_transition";
  state_path: VideoState[];
  risk_tier: RiskTier;
  motion_complexity: MotionComplexity;
  total_duration_seconds: 4 | 6 | 8;
  per_segment_durations: number[];
  warnings: string[];
  blocked_reasons: string[];
};

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
  requested_start_state: VideoState;
  requested_end_state: VideoState;
  risk_tier: RiskTier;
  motion_complexity: MotionComplexity;
  compiled_video_plan: CompiledVideoPlan;
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

const STATE_REQUIRED_ROLES: Partial<Record<VideoState, VideoState[]>> = {
  front: ["front", "fit_anchor"],
  back: ["back", "fit_anchor"],
  three_quarter_left: ["three_quarter_left", "fit_anchor"],
  three_quarter_right: ["three_quarter_right", "fit_anchor"],
  mid_turn_left: ["three_quarter_left", "back", "fit_anchor"],
  mid_turn_right: ["three_quarter_right", "back", "fit_anchor"],
  detail: ["detail", "fit_anchor"],
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
  if ((VIDEO_STATES as readonly string[]).includes(normalized)) return normalized as TransitionStateLabel;
  if (normalized === "left_profile") return "side_left";
  if (normalized === "right_profile") return "side_right";
  return null;
}

function getDirection(start: VideoState, end: VideoState): TransitionPlan["target_direction"] {
  if (start === "front" && end === "back") return "front_to_back";
  if (start === "back" && end === "front") return "back_to_front";
  return "other";
}

function inferRiskTier(prompt: string, base: RiskLevel): RiskTier {
  const normalized = prompt.toLowerCase();
  const highRiskKeywords = /\b(modest|frock|layered|loose|coverage|abaya|tiered)\b/.test(normalized);
  if (base === "high" || highRiskKeywords) return "tier3_high";
  if (base === "medium") return "tier2_medium";
  return "tier1_safe";
}

function inferMotionComplexity(prompt: string): MotionComplexity {
  const normalized = prompt.toLowerCase();
  if (/\b(spin|twirl|run|jump|dance|whip|handheld)\b/.test(normalized)) return "high";
  if (/\b(turn|pivot|walk|rotate|three quarter|back reveal)\b/.test(normalized)) return "medium";
  return "low";
}

function rankCandidate(item: IntermediateStateInput) {
  const sourceScore = SOURCE_PRIORITY[String(item.source_kind ?? "").toLowerCase()] ?? 30;
  const confidence = Math.max(0, Math.min(1, Number(item.confidence_score ?? 0)));
  const sort = Number(item.sort_order ?? 0);
  return sourceScore + confidence + sort / 1000;
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

function getPathForTransition(start: VideoState, end: VideoState): VideoState[] {
  if (start === "front" && end === "back") return ["front", "three_quarter_left", "mid_turn_left", "back"];
  if (start === "back" && end === "front") return ["back", "mid_turn_left", "three_quarter_left", "front"];
  if (start === "front" && (end === "three_quarter_left" || end === "three_quarter_right")) return [start, end];
  if (end === "back" && (start === "three_quarter_left" || start === "three_quarter_right")) return [start, end];
  return [start, end];
}

function isSmallTransition(start: VideoState, end: VideoState) {
  const neighbors = new Set(["front->three_quarter_left", "front->three_quarter_right", "three_quarter_left->back", "three_quarter_right->back", "three_quarter_left->front", "three_quarter_right->front", "back->three_quarter_left", "back->three_quarter_right"]);
  return start === end || neighbors.has(`${start}->${end}`);
}

function compileStatePath(input: {
  requestedStart: VideoState;
  requestedEnd: VideoState;
  garmentRiskTier: RiskTier;
  motionComplexity: MotionComplexity;
  availableRoles: Set<VideoState>;
}): StatePathCompilerOutput {
  const warnings: string[] = [];
  const blockedReasons: string[] = [];
  const direction = getDirection(input.requestedStart, input.requestedEnd);
  const highRiskFrontBack = input.garmentRiskTier === "tier3_high" && (direction === "front_to_back" || direction === "back_to_front");

  const directEligible = isSmallTransition(input.requestedStart, input.requestedEnd)
    && input.garmentRiskTier !== "tier3_high"
    && input.motionComplexity !== "high";

  if (directEligible && !highRiskFrontBack) {
    return {
      strategy: "direct_transition",
      statePath: [input.requestedStart, input.requestedEnd],
      warnings,
      blockedReasons,
    };
  }

  const path = getPathForTransition(input.requestedStart, input.requestedEnd);
  const strategy: StatePathCompilerOutput["strategy"] = path.length > 2 ? "segmented_transition" : "direct_transition";

  if (highRiskFrontBack) {
    warnings.push("Tier3 front/back reveal requires segmented transition to prevent geometry drift.");
    for (const state of path) {
      const requirements = STATE_REQUIRED_ROLES[state] ?? [];
      for (const role of requirements) {
        if (!input.availableRoles.has(role)) {
          blockedReasons.push(`Missing required anchor role '${role}' for state '${state}'.`);
        }
      }
    }
  }

  return {
    strategy,
    statePath: path,
    warnings,
    blockedReasons: Array.from(new Set(blockedReasons)),
  };
}

function buildPromptHint(fromLabel: TransitionStateLabel, toLabel: TransitionStateLabel, riskTier: RiskTier, motionComplexity: MotionComplexity) {
  const lines = [
    `Transition strictly from ${fromLabel} to ${toLabel} using provided truth anchors only.`,
    "Preserve exact garment design, seam placement, silhouette, fit, and coverage.",
    `Motion complexity is ${motionComplexity}; keep camera movement simple and controlled.`,
  ];
  if (riskTier === "tier3_high") {
    lines.push(
      "no silhouette collapse",
      "no bikini conversion",
      "no added skin exposure",
      "no redesign of back panel",
      "no shortening hem",
    );
  }
  return lines.join(" ");
}

function allocateSegmentDurations(total: 4 | 6 | 8, segmentCount: number): number[] {
  if (segmentCount <= 0) return [];
  const base = Math.floor((total / segmentCount) * 10) / 10;
  const durations = Array.from({ length: segmentCount }, () => base);
  const remainder = Number((total - durations.reduce((sum, value) => sum + value, 0)).toFixed(1));
  durations[segmentCount - 1] = Number((durations[segmentCount - 1] + remainder).toFixed(1));
  return durations;
}

export function buildTransitionPlan(input: {
  clipIntentId: string;
  motionPrompt: string;
  items: IntermediateStateInput[];
  garmentRisk: RiskLevel;
  allowDirectFrontBack: boolean;
  requestedStart?: VideoState;
  requestedEnd?: VideoState;
  requestedDurationSeconds?: 4 | 6 | 8;
  validationMode?: boolean;
  startEndFrameMode?: boolean;
  motionComplexity?: MotionComplexity;
}): TransitionPlan {
  const signals = parseIntentSignals(input.motionPrompt);
  const riskTier = inferRiskTier(input.motionPrompt, input.garmentRisk);
  const motionComplexity = input.motionComplexity ?? inferMotionComplexity(input.motionPrompt);
  const requestedStart = input.requestedStart ?? "front";
  const requestedEnd = input.requestedEnd ?? (signals.hasBackReveal || signals.hasWalkAwayMotion ? "back" : "three_quarter_left");
  const targetDirection = getDirection(requestedStart, requestedEnd);

  const defaultDuration: 4 | 6 | 8 = input.validationMode && !input.startEndFrameMode ? 4 : 6;
  let totalDuration: 4 | 6 | 8 = input.requestedDurationSeconds ?? defaultDuration;
  if (input.startEndFrameMode) totalDuration = 8;

  const allStates = VIDEO_STATES
    .map((state) => selectBestState(input.clipIntentId, state, input.items))
    .filter((entry): entry is TransitionVisualState => Boolean(entry));

  const byLabel = new Map<VideoState, TransitionVisualState>();
  for (const state of allStates) byLabel.set(state.state_label, state);

  const compileResult = compileStatePath({
    requestedStart,
    requestedEnd,
    garmentRiskTier: riskTier,
    motionComplexity,
    availableRoles: new Set(allStates.map((state) => state.state_label)),
  });

  const warnings = [...compileResult.warnings];
  const blockedReasons = [...compileResult.blockedReasons];
  if ((targetDirection === "front_to_back" || targetDirection === "back_to_front") && riskTier === "tier3_high" && !input.allowDirectFrontBack) {
    warnings.push("Direct front/back transition is disabled for high-risk garment fidelity.");
  }

  if (input.startEndFrameMode) {
    warnings.push("Start/end frame mode forces 8s duration.");
  }

  const states = compileResult.statePath
    .map((label) => byLabel.get(label))
    .filter((state): state is TransitionVisualState => Boolean(state))
    .map((state, index) => ({ ...state, sequence_index: index }));

  const missingStateLabels = compileResult.statePath.filter((state) => !byLabel.has(state));
  for (const missing of missingStateLabels) {
    blockedReasons.push(`Missing state anchor '${missing}' for compiled state path.`);
  }

  const segmentsRaw = states.slice(0, -1).map((state, index) => ({
    from: state,
    to: states[index + 1],
  }));
  const perSegmentDurations = allocateSegmentDurations(totalDuration, Math.max(segmentsRaw.length, 1));

  const segments: TransitionSegment[] = segmentsRaw.map((pair, index) => {
    const requiredRoles = Array.from(new Set([
      ...(STATE_REQUIRED_ROLES[pair.from.state_label] ?? [pair.from.state_label, "fit_anchor"]),
      ...(STATE_REQUIRED_ROLES[pair.to.state_label] ?? [pair.to.state_label, "fit_anchor"]),
    ]));

    const missingRequired = requiredRoles.filter((role) => !byLabel.has(role));
    const status: TransitionSegment["status"] = missingRequired.length ? "blocked" : "ready";

    return {
      segment_id: `${input.clipIntentId}:segment:${index + 1}`,
      sequence_index: index,
      from_state_id: pair.from.state_id,
      to_state_id: pair.to.state_id,
      from_label: pair.from.state_label,
      to_label: pair.to.state_label,
      from_generation_id: pair.from.generation_id,
      to_generation_id: pair.to.generation_id,
      status,
      reason: status === "ready" ? "Adjacent transition segment is ready." : `Missing required roles: ${missingRequired.join(", ")}`,
      prompt_hint: buildPromptHint(pair.from.state_label, pair.to.state_label, riskTier, motionComplexity),
      duration_seconds: perSegmentDurations[index] ?? totalDuration,
      required_anchor_roles: requiredRoles,
    };
  });

  const effectiveBlocked = Array.from(new Set([
    ...blockedReasons,
    ...segments.filter((segment) => segment.status === "blocked").map((segment) => segment.reason),
  ]));

  const planStrategy: TransitionPlanStrategy = effectiveBlocked.length
    ? "blocked_missing_intermediate"
    : compileResult.strategy === "segmented_transition"
      ? "segmented"
      : "direct";

  const reasons = planStrategy === "segmented"
    ? ["Segmented state path selected for transition control."]
    : planStrategy === "direct"
      ? ["Direct transition selected for low-risk/small transition."]
      : ["Transition blocked due to missing truth anchors."];

  const recommendations = effectiveBlocked.length
    ? ["Provide missing required anchor roles before generation."]
    : [];

  return {
    strategy: planStrategy,
    coverage: states.length ? (effectiveBlocked.length ? "partial" : "complete") : "none",
    direct_transition_allowed: planStrategy === "direct",
    direct_transition_discouraged: planStrategy !== "direct" || riskTier === "tier3_high",
    intermediate_state_required: compileResult.strategy === "segmented_transition",
    intermediate_state_recommended: compileResult.strategy === "segmented_transition",
    target_direction: targetDirection,
    states,
    planned_sequence: compileResult.statePath,
    missing_state_labels: missingStateLabels,
    segments,
    reasons,
    recommendations,
    requested_start_state: requestedStart,
    requested_end_state: requestedEnd,
    risk_tier: riskTier,
    motion_complexity: motionComplexity,
    compiled_video_plan: {
      strategy: compileResult.strategy,
      state_path: compileResult.statePath,
      risk_tier: riskTier,
      motion_complexity: motionComplexity,
      total_duration_seconds: totalDuration,
      per_segment_durations: segments.length ? segments.map((segment) => segment.duration_seconds) : [totalDuration],
      warnings,
      blocked_reasons: effectiveBlocked,
    },
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
  duration_seconds: number;
  required_anchor_roles: VideoState[];
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
      duration_seconds: segment.duration_seconds,
      required_anchor_roles: segment.required_anchor_roles,
    }));
}
