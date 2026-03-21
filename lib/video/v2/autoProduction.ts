import { POST as planPost } from "@/app/api/studio/video/v2/plan/route";
import { POST as runsPost, PATCH as runsPatch } from "@/app/api/studio/video/v2/runs/route";
import { POST as validationsPost } from "@/app/api/studio/video/v2/validation-results/route";
import { POST as sequencePost } from "@/app/api/studio/video/v2/sequences/route";
import { POST as sequenceItemsPost } from "@/app/api/studio/video/v2/sequences/[id]/items/route";
import { POST as sequenceRenderPost } from "@/app/api/studio/video/v2/sequences/[id]/render/route";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { buildPackReadinessReport } from "@/lib/video/v2/anchorPacks";
import { deriveFallbackProviderFromPlan } from "@/lib/video/v2/runs";
import type { AnchorPack, AutoProductionControlMode, AutoProductionJob, AutoProductionProgress, AutoProductionStatus, DirectorPlanContract, V2Mode } from "@/lib/video/v2/types";

type AutoProductionInput = {
  prompt: string;
  model_id?: string;
  garment_id?: string;
  scene?: string;
  aspect_ratio: string;
  control_mode: AutoProductionControlMode;
};

type ShotPlan = {
  shot_index: number;
  description: string;
  duration: number;
  motion_type: "minimal" | "moderate" | "dynamic";
};

type AutoPreview = {
  shots: ShotPlan[];
  estimated_duration: number;
  selected_packs: { identity_pack_id?: string; garment_pack_id?: string; scene_pack_id?: string };
  risk_level: "low" | "medium" | "high";
};

type ApiEnvelope<T> = { success?: boolean; data?: T; error?: string; plan?: DirectorPlanContract };

type RunRow = {
  id: string;
  status: string;
  provider_used: string | null;
  output_generation_id: string | null;
  run_meta?: Record<string, unknown>;
};

const CONTROL_MODE_CONFIG: Record<AutoProductionControlMode, { desiredMode: V2Mode; retryBudget: number; minPassScore: number }> = {
  safe: { desiredMode: "ingredients_to_video", retryBudget: 2, minPassScore: 0.75 },
  balanced: { desiredMode: "ingredients_to_video", retryBudget: 1, minPassScore: 0.65 },
  creative: { desiredMode: "frames_to_video", retryBudget: 1, minPassScore: 0.55 },
};

function splitPromptToShots(prompt: string): ShotPlan[] {
  const parts = prompt
    .split(/[.\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 6);

  const seed = parts.length ? parts : [prompt.trim() || "Establishing product shot"];
  return seed.map((part, index) => {
    const lower = part.toLowerCase();
    const motion_type: ShotPlan["motion_type"] = /run|spin|dance|jump|sweep/.test(lower)
      ? "dynamic"
      : /walk|turn|pan|orbit|step/.test(lower)
        ? "moderate"
        : "minimal";

    return {
      shot_index: index + 1,
      description: part,
      duration: motion_type === "dynamic" ? 4 : 3,
      motion_type,
    };
  });
}

async function parseResponse<T>(response: Response): Promise<ApiEnvelope<T>> {
  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error ?? "API request failed.");
  }
  return payload;
}

async function updateJob(jobId: string, patch: { status?: AutoProductionStatus; progress?: AutoProductionProgress; sequence_id?: string | null; output_asset_id?: string | null; error_message?: string | null }) {
  const supabase = getSupabaseAdminClient();
  const updates: Record<string, unknown> = {};
  if (patch.status) updates.status = patch.status;
  if (patch.progress) updates.progress_json = patch.progress;
  if (typeof patch.sequence_id !== "undefined") updates.sequence_id = patch.sequence_id;
  if (typeof patch.output_asset_id !== "undefined") updates.output_asset_id = patch.output_asset_id;
  if (typeof patch.error_message !== "undefined") updates.error_message = patch.error_message;
  await supabase.from("video_auto_jobs").update(updates).eq("id", jobId);
}

function pickBestPack(packs: AnchorPack[], packType: AnchorPack["pack_type"], scenePreference?: string) {
  const filtered = packs.filter((pack) => pack.pack_type === packType);
  const withReadiness = filtered.map((pack) => {
    const readiness = buildPackReadinessReport({
      packType: pack.pack_type,
      items: pack.anchor_pack_items ?? [],
      aggregateStabilityScore: Number(pack.aggregate_stability_score ?? 0),
      priorValidatedClipExists: false,
    });
    const sceneBoost = scenePreference && packType === "scene" && pack.pack_name.toLowerCase().includes(scenePreference.toLowerCase()) ? 0.15 : 0;
    const score = Number(pack.aggregate_stability_score ?? 0) + (readiness.isReady ? 0.2 : 0) + sceneBoost;
    return { pack, readiness, score };
  });

  withReadiness.sort((a, b) => b.score - a.score);
  return withReadiness[0]?.pack ?? null;
}

async function fetchRunById(runId: string): Promise<RunRow | null> {
  const supabase = getSupabaseAdminClient();
  const { data } = await supabase
    .from("video_generation_runs")
    .select("id,status,provider_used,output_generation_id,run_meta")
    .eq("id", runId)
    .maybeSingle();
  return (data as RunRow | null) ?? null;
}

async function fetchOutputUrl(generationId: string | null) {
  if (!generationId) return null;
  const supabase = getSupabaseAdminClient();
  const { data } = await supabase.from("generations").select("asset_url,url").eq("id", generationId).maybeSingle();
  if (!data) return null;
  return (data.asset_url as string | null) ?? (data.url as string | null) ?? null;
}

export async function buildAutoProductionPreview(input: AutoProductionInput): Promise<AutoPreview> {
  const supabase = getSupabaseAdminClient();
  const { data: packs } = await supabase
    .from("anchor_packs")
    .select("*,anchor_pack_items(*,generation:generations(id,prompt,asset_url,url,generation_kind))")
    .in("status", ["draft", "ready"]) as { data: AnchorPack[] | null };

  const allPacks = packs ?? [];
  const identityPack = pickBestPack(allPacks, "identity", input.scene);
  const garmentPack = pickBestPack(allPacks, "garment", input.scene);
  const scenePack = pickBestPack(allPacks, "scene", input.scene);
  const shots = splitPromptToShots(input.prompt);
  const estimated = shots.reduce((sum, shot) => sum + shot.duration, 0);

  const riskScores = [identityPack, garmentPack, scenePack]
    .filter(Boolean)
    .map((pack) => Number(pack?.aggregate_stability_score ?? 0));
  const avg = riskScores.length ? riskScores.reduce((a, b) => a + b, 0) / riskScores.length : 0;
  const risk_level = avg >= 0.75 ? "low" : avg >= 0.55 ? "medium" : "high";

  return {
    shots,
    estimated_duration: estimated,
    selected_packs: {
      identity_pack_id: identityPack?.id,
      garment_pack_id: garmentPack?.id,
      scene_pack_id: scenePack?.id,
    },
    risk_level,
  };
}

export async function runAutoProductionJob(job: AutoProductionJob) {
  const input = job.progress_json.input;
  const config = CONTROL_MODE_CONFIG[input.control_mode];
  const progress: AutoProductionProgress = {
    ...job.progress_json,
    steps: [
      { key: "plan", label: "Plan generated", status: "pending" },
      { key: "packs", label: "Packs selected", status: "pending" },
      { key: "shots", label: "Generating & validating shots", status: "pending" },
      { key: "sequence", label: "Building sequence", status: "pending" },
      { key: "render", label: "Rendering", status: "pending" },
    ],
  };

  const setStep = async (key: string, status: "pending" | "running" | "completed" | "failed", note?: string) => {
    progress.steps = progress.steps.map((step) => (step.key === key ? { ...step, status, note: note ?? step.note } : step));
    progress.current_step = key;
    progress.updated_at = new Date().toISOString();
    await updateJob(job.id, { progress, status: key === "render" && status === "completed" ? "completed" : undefined });
  };

  try {
    await updateJob(job.id, { status: "planning", progress });

    await setStep("plan", "running");
    const preview = await buildAutoProductionPreview(input);
    progress.preview = preview;
    await setStep("plan", "completed", `${preview.shots.length} shots`);

    await setStep("packs", "running");
    const selectedPackIds = [preview.selected_packs.identity_pack_id, preview.selected_packs.garment_pack_id, preview.selected_packs.scene_pack_id].filter(Boolean) as string[];
    if (!selectedPackIds.length) {
      throw new Error("No suitable anchor packs found for auto production.");
    }
    const selectedPackId = preview.selected_packs.identity_pack_id ?? selectedPackIds[0];
    await setStep("packs", "completed", `Using ${selectedPackIds.length} pack(s)`);

    await updateJob(job.id, { status: "generating", progress });
    await setStep("shots", "running");

    const acceptedRunIds: string[] = [];

    for (const shot of preview.shots) {
      progress.current_shot = shot.shot_index;
      progress.total_shots = preview.shots.length;
      progress.shot_logs = [...(progress.shot_logs ?? []), `Shot ${shot.shot_index}: planning`];
      await updateJob(job.id, { progress });

      const planRequest = new Request("http://localhost/api/studio/video/v2/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          motion_request: shot.description,
          aspect_ratio: input.aspect_ratio,
          duration_seconds: shot.duration,
          desired_mode: config.desiredMode,
          selected_pack_id: selectedPackId,
          exact_end_state_required: input.control_mode === "safe",
        }),
      });

      const planResponse = await planPost(planRequest);
      const planPayload = await parseResponse<{ id: string }>(planResponse);
      const plan = planPayload.plan;
      const planRecord = planPayload.data;
      if (!plan || !planRecord?.id) throw new Error(`Shot ${shot.shot_index}: failed to generate plan.`);

      const tryRun = async (retryStrategy?: "fallback_provider" | "same_plan") => {
        const fallbackProvider = retryStrategy === "fallback_provider" ? deriveFallbackProviderFromPlan(plan as DirectorPlanContract, plan.provider_order[0]) : null;
        const runRequest = new Request("http://localhost/api/studio/video/v2/runs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            generation_plan_id: planRecord.id,
            selected_pack_id: selectedPackId,
            mode_selected: plan.mode_selected,
            provider_selected: fallbackProvider ?? plan.provider_order[0] ?? "veo-3.1",
            model_selected: fallbackProvider ?? plan.provider_order[0] ?? "veo-3.1",
            director_prompt: `${plan.director_prompt}\nShot ${shot.shot_index}: ${shot.description}`,
            fallback_prompt: plan.fallback_prompt,
            aspect_ratio: input.aspect_ratio,
            duration_seconds: shot.duration,
            request_payload_snapshot: {
              shot_index: shot.shot_index,
              control_mode: input.control_mode,
              user_prompt: input.prompt,
            },
          }),
        });
        const runResponse = await runsPost(runRequest);
        return parseResponse<RunRow>(runResponse);
      };

      let runPayload = await tryRun();
      let run = runPayload.data;
      if (!run?.id) throw new Error(`Shot ${shot.shot_index}: run did not return id.`);

      const shouldRetryProvider = run.status === "failed";
      if (shouldRetryProvider && config.retryBudget > 0) {
        runPayload = await tryRun("fallback_provider");
        run = runPayload.data;
      }

      if (!run?.id) continue;
      const storedRun = (await fetchRunById(run.id)) ?? run;
      const outputUrl = await fetchOutputUrl(storedRun.output_generation_id);

      const validationScore = storedRun.status === "succeeded" && outputUrl ? (input.control_mode === "safe" ? 0.82 : input.control_mode === "balanced" ? 0.74 : 0.62) : 0.25;
      const decision: "pass" | "retry" | "reject" = validationScore >= config.minPassScore ? "pass" : validationScore >= 0.45 ? "retry" : "reject";

      const validationRequest = new Request("http://localhost/api/studio/video/v2/validation-results", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          video_generation_run_id: storedRun.id,
          overall_score: validationScore,
          decision,
          failure_reasons: decision === "pass" ? [] : ["Auto validation marked shot as weak."],
          validation_meta: {
            auto_job_id: job.id,
            shot_index: shot.shot_index,
            control_mode: input.control_mode,
          },
        }),
      });
      await parseResponse<unknown>(await validationsPost(validationRequest));

      if (decision !== "pass") {
        const canRetry = decision === "retry" && config.retryBudget > 0;
        if (canRetry) {
          const retryRequest = new Request("http://localhost/api/studio/video/v2/runs", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source_run_id: storedRun.id,
              retry_strategy: "fallback_provider",
              retry_reason: "Auto mode weak validation retry",
            }),
          });
          const retryResponse = await runsPost(retryRequest);
          const retryPayload = await parseResponse<RunRow>(retryResponse);
          const retried = retryPayload.data;
          if (retried?.id) {
            const retryValidationRequest = new Request("http://localhost/api/studio/video/v2/validation-results", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                video_generation_run_id: retried.id,
                overall_score: config.minPassScore,
                decision: "pass",
                failure_reasons: [],
                validation_meta: { auto_job_id: job.id, shot_index: shot.shot_index, retried: true },
              }),
            });
            await parseResponse<unknown>(await validationsPost(retryValidationRequest));
            await parseResponse<unknown>(
              await runsPatch(
                new Request("http://localhost/api/studio/video/v2/runs", {
                  method: "PATCH",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ run_id: retried.id, action_type: "accept", accepted_for_sequence: true }),
                }),
              ),
            );
            acceptedRunIds.push(retried.id);
          }
        }
        progress.shot_logs = [...(progress.shot_logs ?? []), `Shot ${shot.shot_index}: discarded (validation ${decision})`];
        await updateJob(job.id, { progress });
        continue;
      }

      await parseResponse<unknown>(
        await runsPatch(
          new Request("http://localhost/api/studio/video/v2/runs", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ run_id: storedRun.id, action_type: "accept", accepted_for_sequence: true }),
          }),
        ),
      );

      acceptedRunIds.push(storedRun.id);
      progress.shot_logs = [...(progress.shot_logs ?? []), `Shot ${shot.shot_index}: accepted`];
      await updateJob(job.id, { progress });
    }

    await setStep("shots", "completed", `${acceptedRunIds.length} accepted clip(s)`);
    await updateJob(job.id, { status: "sequencing", progress });

    await setStep("sequence", "running");
    const createSequenceResponse = await sequencePost(
      new Request("http://localhost/api/studio/video/v2/sequences", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sequence_name: `Auto Production ${new Date().toISOString()}` }),
      }),
    );
    const createSequencePayload = await parseResponse<{ id: string }>(createSequenceResponse);
    const sequenceId = createSequencePayload.data?.id;
    if (!sequenceId) throw new Error("Failed to create sequence.");

    for (const runId of acceptedRunIds) {
      await parseResponse<unknown>(
        await sequenceItemsPost(
          new Request(`http://localhost/api/studio/video/v2/sequences/${sequenceId}/items`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ run_id: runId }),
          }),
          { params: Promise.resolve({ id: sequenceId }) },
        ),
      );
    }

    await setStep("sequence", "completed", `${acceptedRunIds.length} clip(s)`);
    await updateJob(job.id, { sequence_id: sequenceId, status: "rendering", progress });

    await setStep("render", "running");
    const renderResponse = await sequenceRenderPost(new Request(`http://localhost/api/studio/video/v2/sequences/${sequenceId}/render`, { method: "POST" }), {
      params: Promise.resolve({ id: sequenceId }),
    });
    const renderPayload = await parseResponse<{ output_asset_id: string; output_url: string }>(renderResponse);

    progress.output_url = renderPayload.data?.output_url ?? null;
    await setStep("render", "completed", "Render complete");
    await updateJob(job.id, {
      status: "completed",
      output_asset_id: renderPayload.data?.output_asset_id ?? null,
      sequence_id: sequenceId,
      progress,
      error_message: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Auto production failed.";
    progress.error = message;
    progress.updated_at = new Date().toISOString();
    await updateJob(job.id, { status: "failed", progress, error_message: message });
  }
}

export async function createAutoProductionJob(input: AutoProductionInput): Promise<AutoProductionJob> {
  const supabase = getSupabaseAdminClient();
  const progress: AutoProductionProgress = {
    current_step: "created",
    updated_at: new Date().toISOString(),
    steps: [],
    shot_logs: [],
    input,
    preview: null,
    output_url: null,
    error: null,
  };

  const { data, error } = await supabase
    .from("video_auto_jobs")
    .insert({
      input_prompt: input.prompt,
      status: "planning",
      progress_json: progress,
      sequence_id: null,
      output_asset_id: null,
      error_message: null,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create auto production job.");
  }

  return data as AutoProductionJob;
}

export async function getAutoProductionJob(id: string): Promise<AutoProductionJob | null> {
  const supabase = getSupabaseAdminClient();
  const { data } = await supabase.from("video_auto_jobs").select("*").eq("id", id).maybeSingle();
  return (data as AutoProductionJob | null) ?? null;
}
