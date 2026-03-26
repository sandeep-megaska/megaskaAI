import { resolveRunVideoUrl } from "@/app/studio/video/v2/components/helpers";
import type { VideoRunHistoryRecord } from "@/lib/video/v2/types";
import { orchestrateV2ClipIntent, type V2PlannerOverrides } from "@/lib/video/v2/generationFlowClient";

export type SimpleMode = "strict" | "balanced" | "creative";

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

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const payload = (await res.json()) as { data?: T; error?: string };
  if (!res.ok) throw new Error(payload.error ?? `Request failed for ${url}`);
  return (payload.data ?? payload) as T;
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

export async function uploadSimpleFrame(file: File) {
  const form = new FormData();
  form.append("file", file);
  return fetchJson<{ generationId: string; imageUrl: string }>("/api/studio/video/v2/simple/frame-assets", {
    method: "POST",
    body: form,
  });
}

export async function createSimpleClipIntent(input: {
  startGenerationId: string;
  endGenerationId?: string | null;
  skuCode?: string;
  prompt: string;
  durationSeconds: 4 | 6 | 8;
  aspectRatio: "9:16" | "16:9" | "1:1";
}): Promise<SimpleClipIntentContext> {
  const sourceProfileId = await ensureSourceProfile(input.startGenerationId);

  const intent = await fetchJson<{ id: string }>("/api/studio/video/v2/clip-intents", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      source_profile_id: sourceProfileId,
      intent_label: "Simple frame clip",
      motion_prompt: input.prompt,
      duration_seconds: input.durationSeconds,
      aspect_ratio: input.aspectRatio,
      sku_code: input.skuCode?.trim() || undefined,
      production_mode: "experimental_freeform",
    }),
  });

  await fetchJson("/api/studio/video/v2/working-packs/auto-build", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clip_intent_id: intent.id }),
  });

  await fetchJson(`/api/studio/video/v2/clip-intents/${intent.id}/simple-frame-config`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      start_generation_id: input.startGenerationId,
      end_generation_id: input.endGenerationId ?? null,
      motion_prompt: input.prompt,
      duration_seconds: input.durationSeconds,
      aspect_ratio: input.aspectRatio,
    }),
  });

  return { clipIntentId: intent.id, sourceProfileId };
}

export async function generateSimpleVideo(input: {
  clipIntentId: string;
  durationSeconds: 4 | 6 | 8;
  hasEndFrame: boolean;
  mode: SimpleMode;
}) {
  const modeOverrides: Pick<V2PlannerOverrides, "validationMode" | "motionComplexity"> =
    input.mode === "strict"
      ? { validationMode: true, motionComplexity: "low" }
      : input.mode === "creative"
        ? { validationMode: false, motionComplexity: "high" }
        : { validationMode: false, motionComplexity: "medium" };

  const plannerOverrides: V2PlannerOverrides = {
    requestedStart: "start_frame",
    requestedEnd: input.hasEndFrame ? "end_frame" : "start_frame",
    requestedDurationSeconds: input.durationSeconds,
    startEndFrameMode: input.hasEndFrame,
    ...modeOverrides,
  };

  await orchestrateV2ClipIntent(input.clipIntentId, plannerOverrides);

  await fetchJson(`/api/studio/video/v2/clip-intents/${input.clipIntentId}/compile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ planner_overrides: plannerOverrides }),
  });

  const generated = await fetchJson<{ run_id: string; status: string }>(`/api/studio/video/v2/clip-intents/${input.clipIntentId}/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ planner_overrides: plannerOverrides }),
  });

  return { run_id: generated.run_id };
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

  const outputUrl = resolveRunVideoUrl(run as VideoRunHistoryRecord);

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
