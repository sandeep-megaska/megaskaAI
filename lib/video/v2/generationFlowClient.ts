export type V2PlannerOverrides = {
  requestedStart?: "front" | "three_quarter_left" | "three_quarter_right" | "mid_turn_left" | "mid_turn_right" | "back" | "detail" | "fit_anchor" | "start_frame" | "end_frame";
  requestedEnd?: "front" | "three_quarter_left" | "three_quarter_right" | "mid_turn_left" | "mid_turn_right" | "back" | "detail" | "fit_anchor" | "start_frame" | "end_frame";
  motionComplexity?: "low" | "medium" | "high";
  requestedDurationSeconds?: 4 | 6 | 8;
  validationMode?: boolean;
  startEndFrameMode?: boolean;
};

type OrchestrationResponse = {
  compileReady: boolean;
  generateReady: boolean;
  summary?: string;
  reasons?: string[];
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const payload = (await res.json()) as { data?: T; error?: string };
  if (!res.ok) throw new Error(payload.error ?? `Request failed for ${url}`);
  return (payload.data ?? payload) as T;
}

function toOrchestrationOverrides(overrides: V2PlannerOverrides | undefined) {
  if (!overrides) return undefined;
  return {
    requested_start: overrides.requestedStart,
    requested_end: overrides.requestedEnd,
    motion_complexity: overrides.motionComplexity,
    duration_seconds: overrides.requestedDurationSeconds,
    validation_mode: overrides.validationMode,
    start_end_frame_mode: overrides.startEndFrameMode,
  };
}

function readinessFailure(plan: OrchestrationResponse, fallback: string) {
  return plan.reasons?.[0] ?? plan.summary ?? fallback;
}

export async function orchestrateV2ClipIntent(clipIntentId: string, plannerOverrides?: V2PlannerOverrides): Promise<OrchestrationResponse> {
  return fetchJson<OrchestrationResponse>(`/api/studio/video/v2/clip-intents/${clipIntentId}/orchestrate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ planner_overrides: toOrchestrationOverrides(plannerOverrides) }),
  });
}

export async function compileV2ClipIntent(clipIntentId: string, plannerOverrides?: V2PlannerOverrides) {
  return fetchJson<{ clip_intent_id: string; compiled_anchor_pack_id: string; warnings: string[] }>(`/api/studio/video/v2/clip-intents/${clipIntentId}/compile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ planner_overrides: plannerOverrides }),
  });
}

export async function generateV2ClipIntent(clipIntentId: string) {
  return fetchJson<{ run_id: string; status: string }>(`/api/studio/video/v2/clip-intents/${clipIntentId}/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
  });
}

export async function runV2ClipGenerationFlow(input: { clipIntentId: string; plannerOverrides?: V2PlannerOverrides }) {
  const initialPlan = await orchestrateV2ClipIntent(input.clipIntentId, input.plannerOverrides);
  if (!initialPlan.compileReady) {
    throw new Error(readinessFailure(initialPlan, "Clip is not ready to compile yet."));
  }

  await compileV2ClipIntent(input.clipIntentId, input.plannerOverrides);

  const postCompilePlan = await orchestrateV2ClipIntent(input.clipIntentId, input.plannerOverrides);
  if (!postCompilePlan.generateReady) {
    throw new Error(readinessFailure(postCompilePlan, "Clip is not ready to generate yet."));
  }

  const generated = await generateV2ClipIntent(input.clipIntentId);
  return { generated, orchestration: postCompilePlan };
}
