import { resolveRunVideoUrl } from "@/app/studio/video/v2/components/helpers";
import type { VideoRunHistoryRecord } from "@/lib/video/v2/types";

export type SimpleMotionType = "front_pose" | "slight_turn" | "turn_to_back" | "detail_reveal";
export type SimpleViewState = "front" | "three_quarter_left" | "three_quarter_right" | "back" | "detail";

export type SimpleReadiness = {
  decision: "proceed" | "warn" | "block";
  missingRoles: string[];
  criticalMissingRoles: string[];
  requiredRoles: string[];
  warnings: string[];
  reasons: string[];
  garmentRisk: "low" | "medium" | "high";
  strategy: "not_applicable" | "direct" | "segmented" | "blocked_missing_intermediate";
  pathSummary: string;
  blockedReasons: string[];
  statusLines: string[];
};

export type SimpleClipIntentContext = {
  clipIntentId: string;
  sourceProfileId: string;
};

export type SimpleRunResult = {
  runId: string;
  status: string;
  outputUrl: string | null;
  outputThumbnailUrl: string | null;
  outputGenerationId: string | null;
  outcome: "pass" | "retry" | "reject" | "manual_review" | "pending";
  acceptedForSequence: boolean;
  failureMessage: string | null;
};

type FixMissingAnglesStep =
  | "Checking existing angles"
  | "Reusing available truth"
  | "Creating missing angles"
  | "Refreshing SKU truth"
  | "Updating clip readiness";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const payload = (await res.json()) as { data?: T; error?: string };
  if (!res.ok) throw new Error(payload.error ?? `Request failed for ${url}`);
  return (payload.data ?? payload) as T;
}

function prioritizeFixRoles(roles: string[]): string[] {
  const normalized = roles.map((role) => {
    if (role === "fit" || role === "fit_profile" || role === "fit_anchor") return "fit_anchor";
    return role;
  });

  const deduped = Array.from(new Set(normalized));
  const priority = ["three_quarter_left", "three_quarter_right", "fit_anchor", "detail"];
  const prioritized = priority.filter((role) => deduped.includes(role));
  const remaining = deduped.filter((role) => !priority.includes(role));
  return [...prioritized, ...remaining];
}

async function ensureSourceProfile(selectedGenerationId: string): Promise<string> {
  const profiles = await fetchJson<Array<{ id: string; primary_generation_id: string }>>("/api/studio/video/v2/source-profiles", { cache: "no-store" });
  const existing = profiles.find((profile) => profile.primary_generation_id === selectedGenerationId);
  if (existing) return existing.id;
  const created = await fetchJson<{ id: string }>("/api/studio/video/v2/source-profiles", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      profile_name: `Simple video profile ${selectedGenerationId.slice(0, 8)}`,
      primary_generation_id: selectedGenerationId,
    }),
  });
  return created.id;
}

export async function createSimpleClipIntent(input: {
  selectedGenerationId: string;
  skuCode?: string;
  motionPrompt: string;
  intentLabel: string;
  durationSeconds: 4 | 6 | 8;
}): Promise<SimpleClipIntentContext> {
  const sourceProfileId = await ensureSourceProfile(input.selectedGenerationId);
  const intent = await fetchJson<{ id: string }>("/api/studio/video/v2/clip-intents", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      source_profile_id: sourceProfileId,
      intent_label: input.intentLabel,
      motion_prompt: input.motionPrompt,
      duration_seconds: input.durationSeconds,
      sku_code: input.skuCode?.trim() || undefined,
      production_mode: "phase1_template",
      phase1_template_id: "front_still_luxury",
    }),
  });

  await fetchJson("/api/studio/video/v2/working-packs/auto-build", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clip_intent_id: intent.id }),
  });

  if (input.skuCode?.trim()) {
    await fetchJson(`/api/studio/video/v2/clip-intents/${intent.id}/apply-sku-truth`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sku_code: input.skuCode.trim() }),
    });
  }

  return { clipIntentId: intent.id, sourceProfileId };
}

export async function loadReadiness(input: {
  clipIntentId: string;
  startState: SimpleViewState;
  endState: SimpleViewState;
  durationSeconds: 4 | 6 | 8;
  validationMode: boolean;
  motionComplexity: "low" | "medium" | "high";
}): Promise<SimpleReadiness> {
  const fidelity = await fetchJson<{
    decision: "proceed" | "warn" | "block";
    warnings?: string[];
    reasons?: string[];
    missing_roles?: string[];
    critical_missing_roles?: string[];
    required_roles?: string[];
    risk_summary?: { garmentRisk?: "low" | "medium" | "high" };
    transition_plan?: {
      strategy: SimpleReadiness["strategy"];
      compiled_video_plan?: { state_path?: string[]; blocked_reasons?: string[] };
      missing_state_labels?: string[];
    };
  }>(`/api/studio/video/v2/clip-intents/${input.clipIntentId}/fidelity-plan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      requested_start: input.startState,
      requested_end: input.endState,
      duration_seconds: input.durationSeconds,
      validation_mode: input.validationMode,
      motion_complexity: input.motionComplexity,
    }),
  });

  const strategy = fidelity.transition_plan?.strategy ?? "not_applicable";
  const missingRoles = fidelity.missing_roles ?? [];
  const blockedReasons = fidelity.transition_plan?.compiled_video_plan?.blocked_reasons ?? [];
  const statusLines = [
    "Checking truth coverage",
    "Choosing safest path",
    strategy === "segmented" ? "Using segmented transition" : "Using direct transition",
    input.validationMode ? "Preparing validation clip" : "Preparing production clip",
  ];

  return {
    decision: fidelity.decision,
    missingRoles,
    criticalMissingRoles: fidelity.critical_missing_roles ?? [],
    requiredRoles: fidelity.required_roles ?? [],
    warnings: fidelity.warnings ?? [],
    reasons: fidelity.reasons ?? [],
    garmentRisk: fidelity.risk_summary?.garmentRisk ?? "medium",
    strategy,
    pathSummary: fidelity.transition_plan?.compiled_video_plan?.state_path?.join(" → ") ?? `${input.startState} → ${input.endState}`,
    blockedReasons,
    statusLines,
  };
}

export async function fixMissingAngles(
  input: {
    clipIntentId: string;
    skuCode?: string;
    roles?: string[];
    startState?: SimpleViewState;
    endState?: SimpleViewState;
    durationSeconds?: 4 | 6 | 8;
    validationMode?: boolean;
    motionComplexity?: "low" | "medium" | "high";
  },
  onStep?: (step: FixMissingAnglesStep) => void,
) {
  const prioritizedRoles = prioritizeFixRoles(input.roles ?? []);
  onStep?.("Checking existing angles");

  onStep?.("Reusing available truth");
  await fetchJson(`/api/studio/video/v2/clip-intents/${input.clipIntentId}/reuse-anchors`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ roles: prioritizedRoles }),
  });

  onStep?.("Creating missing angles");
  await fetchJson(`/api/studio/video/v2/clip-intents/${input.clipIntentId}/expand-anchors`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ roles: prioritizedRoles }),
  });

  if (input.skuCode?.trim()) {
    onStep?.("Refreshing SKU truth");
    await fetchJson(`/api/studio/video/v2/clip-intents/${input.clipIntentId}/apply-sku-truth`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sku_code: input.skuCode.trim() }),
    });
  }

  onStep?.("Updating clip readiness");
  const plannerBody = JSON.stringify({
    requested_start: input.startState,
    requested_end: input.endState,
    duration_seconds: input.durationSeconds,
    validation_mode: input.validationMode,
    motion_complexity: input.motionComplexity,
  });
  await fetchJson(`/api/studio/video/v2/clip-intents/${input.clipIntentId}/plan-fidelity`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: plannerBody,
  });
  await fetchJson(`/api/studio/video/v2/clip-intents/${input.clipIntentId}/plan-transition-states`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: plannerBody,
  });
}

export async function generateSimpleVideo(input: { clipIntentId: string; startState: SimpleViewState; endState: SimpleViewState; durationSeconds: 4 | 6 | 8; validationMode: boolean; motionComplexity: "low" | "medium" | "high"; }) {
  console.info("[SimpleVideo] calling endpoint", { endpoint: `/api/studio/video/v2/clip-intents/${input.clipIntentId}/orchestrate` });
  const orchestration = await fetchJson<{ compileReady: boolean; generateReady: boolean; summary?: string; reasons?: string[] }>(`/api/studio/video/v2/clip-intents/${input.clipIntentId}/orchestrate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      planner_overrides: {
        requested_start: input.startState,
        requested_end: input.endState,
        duration_seconds: input.durationSeconds,
        validation_mode: input.validationMode,
        motion_complexity: input.motionComplexity,
      },
    }),
  });

  if (!orchestration.compileReady || !orchestration.generateReady) {
    throw new Error(orchestration.reasons?.[0] ?? orchestration.summary ?? "Clip is not ready to generate yet.");
  }

  console.info("[SimpleVideo] calling endpoint", { endpoint: `/api/studio/video/v2/clip-intents/${input.clipIntentId}/compile` });
  await fetchJson(`/api/studio/video/v2/clip-intents/${input.clipIntentId}/compile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
  });

  console.info("[SimpleVideo] calling endpoint", { endpoint: `/api/studio/video/v2/clip-intents/${input.clipIntentId}/generate` });
  const generated = await fetchJson<{ run_id: string; status: string }>(`/api/studio/video/v2/clip-intents/${input.clipIntentId}/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
  });

  return generated;
}

export async function loadRunResult(runId: string): Promise<SimpleRunResult> {
  const runs = await fetchJson<Array<{
    id: string;
    status: string;
    output_generation_id?: string | null;
    output_asset_url?: string | null;
    full_output_asset_url?: string | null;
    preview_asset_url?: string | null;
    run_mode?: string | null;
    run_meta?: Record<string, unknown> | null;
    request_payload_snapshot?: Record<string, unknown> | null;
    output_thumbnail_url?: string | null;
    accepted_for_sequence?: boolean;
    failure_message?: string | null;
    validation?: { decision?: "pass" | "retry" | "reject" | "manual_review" } | null;
  }>>("/api/studio/video/v2/runs", { cache: "no-store" });
  const run = runs.find((entry) => entry.id === runId);
  if (!run) {
    return { runId, status: "queued", outputUrl: null, outputThumbnailUrl: null, outputGenerationId: null, outcome: "pending", acceptedForSequence: false, failureMessage: null };
  }

  const outputUrl = resolveRunVideoUrl(run as VideoRunHistoryRecord, { preferValidationPreview: true });

  return {
    runId,
    status: run.status,
    outputUrl,
    outputThumbnailUrl: run.output_thumbnail_url ?? null,
    outputGenerationId: run.output_generation_id ?? null,
    outcome: run.validation?.decision ?? "pending",
    acceptedForSequence: Boolean(run.accepted_for_sequence),
    failureMessage: run.failure_message ?? null,
  };
}

export async function retrySafer(runId: string) {
  await fetchJson("/api/studio/video/v2/runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source_run_id: runId, retry_strategy: "safer_mode", retry_reason: "Operator-triggered safer retry from simple workflow." }),
  });
}
