import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { runVideoJob } from "@/lib/video/runVideoJob";
import { isStudioAspectRatio } from "@/lib/studio/aspectRatios";
import { buildPackReadinessReport } from "@/lib/video/v2/anchorPacks";
import { buildRecoveryRecommendation } from "@/lib/video/v2/recovery";
import { deriveFallbackProviderFromPlan, deriveProviderFromPlan, normalizeRunStatus, resolvePrimaryFrameUrl } from "@/lib/video/v2/runs";
import type {
  AnchorPack,
  AnchorPackItem,
  DirectorPlanContract,
  ExecuteVideoRunRequest,
  RetryStrategy,
  V2Mode,
  VideoRunHistoryRecord,
  VideoRunStatus,
} from "@/lib/video/v2/types";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function parseRunMeta(runMeta: unknown): Record<string, unknown> {
  if (!runMeta || typeof runMeta !== "object" || Array.isArray(runMeta)) return {};
  return runMeta as Record<string, unknown>;
}

function parsePlanContract(plan: Record<string, unknown>): DirectorPlanContract {
  return {
    mode_selected: String(plan.mode_selected ?? "ingredients_to_video") as V2Mode,
    why_mode_selected: String(plan.why_mode_selected ?? ""),
    recommended_pack_ids: (plan.recommended_pack_ids as string[] | null) ?? [],
    required_reference_roles: (plan.required_reference_roles as DirectorPlanContract["required_reference_roles"] | null) ?? [],
    duration_seconds: Number(plan.duration_seconds ?? 8),
    aspect_ratio: String(plan.aspect_ratio ?? "9:16"),
    motion_complexity: (plan.motion_complexity as DirectorPlanContract["motion_complexity"]) ?? "low",
    anchor_risk_level: (plan.anchor_risk_level as DirectorPlanContract["anchor_risk_level"]) ?? "medium",
    director_prompt: String(plan.director_prompt ?? ""),
    fallback_prompt: String(plan.fallback_prompt ?? ""),
    negative_constraints: (plan.negative_constraints as string[] | null) ?? [],
    provider_order: (plan.provider_order as string[] | null) ?? [],
    mode_suitability: [],
    pack_risk: (plan.anchor_risk_level as DirectorPlanContract["anchor_risk_level"]) ?? "medium",
    missing_requirements: [],
  };
}

function pickRetryStrategy(input?: string | null): RetryStrategy {
  if (input === "same_plan" || input === "fallback_model" || input === "fallback_provider" || input === "safer_mode") return input;
  return "same_plan";
}

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();
    const { data: runs, error } = await supabase
      .from("video_generation_runs")
      .select("id,generation_plan_id,output_generation_id,mode_selected,status,provider_used,provider_model,run_meta,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) return json(500, { success: false, error: error.message });

    const normalizedRuns = (runs ?? []).map((run) => ({
      ...run,
      status: normalizeRunStatus(run.status),
      run_meta: parseRunMeta(run.run_meta),
    }));

    const planIds = Array.from(new Set(normalizedRuns.map((run) => run.generation_plan_id).filter(Boolean)));
    const outputIds = Array.from(new Set(normalizedRuns.map((run) => run.output_generation_id).filter(Boolean)));
    const packIds = Array.from(
      new Set(
        normalizedRuns
          .map((run) => {
            const meta = parseRunMeta(run.run_meta);
            const selectedPackId = meta.selected_pack_id;
            return typeof selectedPackId === "string" ? selectedPackId : null;
          })
          .filter(Boolean),
      ),
    );

    const [{ data: plans }, { data: packs }, { data: outputs }, { data: validations }] = await Promise.all([
      planIds.length
        ? supabase.from("video_generation_plans").select("id,motion_request,provider_order").in("id", planIds)
        : Promise.resolve({ data: [] }),
      packIds.length
        ? supabase
            .from("anchor_packs")
            .select("id,pack_name,pack_type,aggregate_stability_score,anchor_pack_items(role,stability_score)")
            .in("id", packIds)
        : Promise.resolve({ data: [] }),
      outputIds.length
        ? supabase.from("generations").select("id,asset_url,url,status,thumbnail_url").in("id", outputIds)
        : Promise.resolve({ data: [] }),
      normalizedRuns.length
        ? supabase
            .from("video_validation_results")
            .select("id,video_generation_run_id,overall_score,decision,failure_reasons,created_at")
            .in(
              "video_generation_run_id",
              normalizedRuns.map((run) => run.id),
            )
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);

    const planMap = new Map((plans ?? []).map((entry) => [entry.id, entry]));
    const packMap = new Map((packs ?? []).map((entry) => [entry.id, entry]));
    const outputMap = new Map((outputs ?? []).map((entry) => [entry.id, entry]));
    type ValidationRow = {
      id: string;
      video_generation_run_id: string;
      overall_score: number;
      decision: "pass" | "retry" | "reject" | "manual_review";
      failure_reasons: string[];
      created_at: string;
    };
    const validationMap = new Map<string, ValidationRow>();

    for (const validation of validations ?? []) {
      if (!validationMap.has(validation.video_generation_run_id)) {
        validationMap.set(validation.video_generation_run_id, validation);
      }
    }

    const data = normalizedRuns.map((run) => {
      const runMeta = parseRunMeta(run.run_meta);
      const selectedPackId = typeof runMeta.selected_pack_id === "string" ? runMeta.selected_pack_id : null;
      const output = run.output_generation_id ? outputMap.get(run.output_generation_id) : null;
      const validation = validationMap.get(run.id);
      const status: VideoRunStatus = validation ? "validated" : normalizeRunStatus(run.status);
      const pack = selectedPackId ? packMap.get(selectedPackId) : null;
      const plan = planMap.get(run.generation_plan_id);
      const packReadiness = pack
        ? buildPackReadinessReport({
            packType: pack.pack_type,
            items: (pack.anchor_pack_items ?? []) as Partial<AnchorPackItem>[],
            aggregateStabilityScore: Number(pack.aggregate_stability_score ?? 0),
            priorValidatedClipExists: false,
          })
        : null;
      const fallback = plan
        ? deriveFallbackProviderFromPlan(
            parsePlanContract(plan as Record<string, unknown>),
            typeof run.provider_used === "string" ? run.provider_used : null,
          )
        : null;

      const row: VideoRunHistoryRecord = {
        ...run,
        status,
        plan_motion_request: planMap.get(run.generation_plan_id)?.motion_request ?? null,
        selected_pack_id: selectedPackId,
        selected_pack_name: selectedPackId ? (packMap.get(selectedPackId)?.pack_name ?? null) : null,
        request_payload_snapshot:
          runMeta.request_payload_snapshot && typeof runMeta.request_payload_snapshot === "object"
            ? (runMeta.request_payload_snapshot as Record<string, unknown>)
            : null,
        output_asset_url: output?.asset_url ?? output?.url ?? null,
        output_thumbnail_url: output?.thumbnail_url ?? null,
        output_generation_status: output?.status ?? null,
        failure_message: typeof runMeta.failure_message === "string" ? runMeta.failure_message : null,
        retried_from_run_id: typeof runMeta.retried_from_run_id === "string" ? runMeta.retried_from_run_id : null,
        retry_strategy: typeof runMeta.retry_strategy === "string" ? (runMeta.retry_strategy as RetryStrategy) : null,
        retry_reason: typeof runMeta.retry_reason === "string" ? runMeta.retry_reason : null,
        validation: validation
          ? {
              id: validation.id,
              overall_score: Number(validation.overall_score ?? 0),
              decision: validation.decision,
              failure_reasons: validation.failure_reasons ?? [],
              created_at: validation.created_at,
            }
          : null,
      };

      row.recovery_recommendation = buildRecoveryRecommendation({
        run: row,
        packReadiness,
        fallbackProvider: fallback,
        fallbackModel: fallback,
      });
      return row;
    });

    return json(200, { success: true, data });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<ExecuteVideoRunRequest>;
    const supabase = getSupabaseAdminClient();

    let runRequest = body;

    if (body.source_run_id?.trim()) {
      const retryStrategy = pickRetryStrategy(body.retry_strategy);
      const { data: sourceRun, error: sourceError } = await supabase
        .from("video_generation_runs")
        .select("*")
        .eq("id", body.source_run_id)
        .single();
      if (sourceError || !sourceRun) return json(404, { success: false, error: sourceError?.message ?? "Source run not found." });

      const sourceMeta = parseRunMeta(sourceRun.run_meta);
      const selectedPackId =
        typeof body.selected_pack_id === "string" && body.selected_pack_id.trim()
          ? body.selected_pack_id
          : typeof sourceMeta.selected_pack_id === "string"
            ? sourceMeta.selected_pack_id
            : "";

      const [{ data: plan, error: planError }, { data: pack, error: packError }] = await Promise.all([
        supabase.from("video_generation_plans").select("*").eq("id", sourceRun.generation_plan_id).single(),
        selectedPackId
          ? supabase
              .from("anchor_packs")
              .select("*,anchor_pack_items(*,generation:generations(id,prompt,asset_url,url,generation_kind))")
              .eq("id", selectedPackId)
              .single()
          : Promise.resolve({ data: null, error: { message: "Selected pack not found." } }),
      ]);
      if (planError || !plan) return json(404, { success: false, error: planError?.message ?? "Plan not found." });
      if (packError || !pack) return json(404, { success: false, error: packError?.message ?? "Selected pack not found." });

      const planContract = parsePlanContract(plan as Record<string, unknown>);
      const fallbackProvider = deriveFallbackProviderFromPlan(planContract, sourceRun.provider_used);
      const readiness = buildPackReadinessReport({
        packType: pack.pack_type,
        items: pack.anchor_pack_items ?? [],
        aggregateStabilityScore: Number(pack.aggregate_stability_score ?? 0),
        priorValidatedClipExists: false,
      });

      const saferMode =
        sourceRun.mode_selected === "frames_to_video" && readiness.modeSuitability.find((entry) => entry.mode === "ingredients_to_video")?.level !== "insufficient"
          ? "ingredients_to_video"
          : null;

      if (retryStrategy === "fallback_provider" && !fallbackProvider) {
        return json(400, { success: false, error: "Fallback provider/model is not available for this plan." });
      }
      if (retryStrategy === "safer_mode" && !saferMode && !body.override_mode) {
        return json(400, { success: false, error: "Safer mode retry is unavailable for this pack/mode suitability." });
      }

      const inheritedSnapshot =
        sourceMeta.request_payload_snapshot && typeof sourceMeta.request_payload_snapshot === "object"
          ? (sourceMeta.request_payload_snapshot as Record<string, unknown>)
          : {};
      const resolvedMode = (body.override_mode ?? (retryStrategy === "safer_mode" ? saferMode : sourceRun.mode_selected)) as V2Mode;
      const resolvedProvider =
        body.override_provider ?? (retryStrategy === "fallback_provider" || retryStrategy === "fallback_model" ? fallbackProvider : sourceRun.provider_used);
      const resolvedModel = body.override_model ?? resolvedProvider ?? sourceRun.provider_model ?? sourceRun.provider_used;

      runRequest = {
        generation_plan_id: sourceRun.generation_plan_id,
        selected_pack_id: selectedPackId,
        mode_selected: resolvedMode,
        provider_selected: String(resolvedProvider ?? sourceRun.provider_used ?? "veo-3.1"),
        model_selected: String(resolvedModel ?? sourceRun.provider_model ?? "veo-3.1"),
        director_prompt: String(inheritedSnapshot.director_prompt ?? plan.director_prompt ?? ""),
        fallback_prompt: String(inheritedSnapshot.fallback_prompt ?? plan.fallback_prompt ?? ""),
        aspect_ratio: String(inheritedSnapshot.aspect_ratio ?? plan.aspect_ratio ?? "9:16"),
        duration_seconds: Number(inheritedSnapshot.duration_seconds ?? plan.duration_seconds ?? 8),
        request_payload_snapshot: {
          ...inheritedSnapshot,
          retry_mode_override: body.override_mode ?? null,
          retry_provider_override: body.override_provider ?? null,
          retry_model_override: body.override_model ?? null,
          new_seed: body.new_seed ?? null,
          retried_from_run_id: sourceRun.id,
          retry_strategy: retryStrategy,
        },
        source_run_id: sourceRun.id,
        retry_strategy: retryStrategy,
        retry_reason: body.retry_reason ?? "Operator-triggered recovery action.",
      };
    }

    if (!runRequest.generation_plan_id?.trim()) return json(400, { success: false, error: "generation_plan_id is required." });
    if (!runRequest.selected_pack_id?.trim()) return json(400, { success: false, error: "selected_pack_id is required." });
    if (!runRequest.mode_selected?.trim()) return json(400, { success: false, error: "mode_selected is required." });
    if (!runRequest.director_prompt?.trim()) return json(400, { success: false, error: "director_prompt is required." });

    const [{ data: plan, error: planError }, { data: pack, error: packError }] = await Promise.all([
      supabase.from("video_generation_plans").select("*").eq("id", runRequest.generation_plan_id).single(),
      supabase
        .from("anchor_packs")
        .select("*,anchor_pack_items(*,generation:generations(id,prompt,asset_url,url,generation_kind))")
        .eq("id", runRequest.selected_pack_id)
        .single(),
    ]);

    if (planError || !plan) return json(404, { success: false, error: planError?.message ?? "Plan not found." });
    if (packError || !pack) return json(404, { success: false, error: packError?.message ?? "Selected pack not found." });

    const planContract = parsePlanContract(plan as Record<string, unknown>);

    const providerInfo = runRequest.provider_selected && runRequest.model_selected
      ? { providerSelected: runRequest.provider_selected, modelSelected: runRequest.model_selected }
      : deriveProviderFromPlan(planContract);

    const initialMeta: Record<string, unknown> = {
      selected_pack_id: runRequest.selected_pack_id,
      fallback_prompt: runRequest.fallback_prompt ?? plan.fallback_prompt ?? null,
      request_payload_snapshot: runRequest.request_payload_snapshot ?? {},
      execution_notes: "Run accepted by V2 execute endpoint.",
      retried_from_run_id: runRequest.source_run_id ?? null,
      retry_strategy: runRequest.retry_strategy ?? null,
      retry_reason: runRequest.retry_reason ?? null,
      original_mode_selected: runRequest.source_run_id ? plan.mode_selected : null,
      retry_mode_selected: runRequest.source_run_id ? runRequest.mode_selected : null,
    };

    const { data: insertedRun, error: runError } = await supabase
      .from("video_generation_runs")
      .insert({
        generation_plan_id: runRequest.generation_plan_id,
        output_generation_id: null,
        mode_selected: runRequest.mode_selected,
        status: "queued",
        provider_used: providerInfo.providerSelected,
        provider_model: providerInfo.modelSelected,
        run_meta: initialMeta,
      })
      .select("*")
      .single();

    if (runError || !insertedRun) return json(400, { success: false, error: runError?.message ?? "Failed to create run." });

    const primaryFrameUrl = resolvePrimaryFrameUrl(pack as AnchorPack);
    if (!primaryFrameUrl) {
      const nextMeta = {
        ...initialMeta,
        failure_message: "Unable to start provider run: selected pack has no usable anchor image URL.",
      };
      await supabase.from("video_generation_runs").update({ status: "failed", run_meta: nextMeta }).eq("id", insertedRun.id);
      return json(201, {
        success: true,
        data: {
          ...insertedRun,
          status: "failed",
          run_meta: nextMeta,
          failure_message: nextMeta.failure_message,
        },
      });
    }

    await supabase.from("video_generation_runs").update({ status: "running" }).eq("id", insertedRun.id);

    try {
      const selectedAspectRatio = String(runRequest.aspect_ratio ?? plan.aspect_ratio ?? "9:16");
      const execution = await runVideoJob({
        backendId: providerInfo.providerSelected,
        prompt: runRequest.director_prompt,
        durationSeconds: Number(runRequest.duration_seconds ?? plan.duration_seconds ?? 8),
        firstFrameUrl: primaryFrameUrl,
        aspectRatio: isStudioAspectRatio(selectedAspectRatio) ? selectedAspectRatio : "9:16",
        requestedFidelityPriority: "maximum-fidelity",
        inputMode: "anchor-based",
      });

      const generationInsertPayload = {
        prompt: runRequest.director_prompt,
        type: "Video",
        media_type: "Video",
        status: "completed",
        aspect_ratio: runRequest.aspect_ratio ?? plan.aspect_ratio ?? "9:16",
        asset_url: null,
        url: null,
        generation_kind: "video",
        source_generation_id: null,
        thumbnail_url: null,
        video_meta: {
          provider: execution.provider,
          backendId: execution.backendId,
          backendModel: execution.backendModel,
          providerModelId: execution.providerModelId,
          providerResponse: execution.providerResponseMeta,
          note: "V2 slice 3A stores provider execution metadata; binary upload pipeline not yet linked here.",
        },
      } satisfies Record<string, unknown>;

      const { data: outputGeneration, error: outputError } = await supabase
        .from("generations")
        .insert(generationInsertPayload)
        .select("id,status")
        .single();

      if (outputError || !outputGeneration) {
        const failMeta = {
          ...initialMeta,
          failure_message: outputError?.message ?? "Provider finished but output persistence failed.",
        };
        await supabase
          .from("video_generation_runs")
          .update({ status: "failed", run_meta: failMeta })
          .eq("id", insertedRun.id);
        return json(201, {
          success: true,
          data: { ...insertedRun, status: "failed", run_meta: failMeta, failure_message: failMeta.failure_message },
        });
      }

      const successMeta = {
        ...initialMeta,
        provider_response: execution.providerResponseMeta,
        diagnostics: execution.diagnostics,
        execution_notes: "Provider execution completed; output metadata persisted.",
      };

      const { data: updatedRun, error: updateError } = await supabase
        .from("video_generation_runs")
        .update({
          status: "succeeded",
          output_generation_id: outputGeneration.id,
          run_meta: successMeta,
        })
        .eq("id", insertedRun.id)
        .select("*")
        .single();

      if (updateError || !updatedRun) {
        return json(201, {
          success: true,
          data: { ...insertedRun, status: "succeeded", output_generation_id: outputGeneration.id, run_meta: successMeta },
        });
      }

      return json(201, { success: true, data: updatedRun });
    } catch (providerError) {
      const message = providerError instanceof Error ? providerError.message : "Provider execution failed.";
      const failMeta = {
        ...initialMeta,
        failure_message: message,
        provider_error: {
          message,
        },
      };

      const { data: failedRun } = await supabase
        .from("video_generation_runs")
        .update({ status: "failed", run_meta: failMeta })
        .eq("id", insertedRun.id)
        .select("*")
        .single();

      return json(201, {
        success: true,
        data: failedRun ?? { ...insertedRun, status: "failed", run_meta: failMeta },
      });
    }
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      run_id?: string;
      status?: VideoRunStatus;
      output_generation_id?: string | null;
      run_meta?: Record<string, unknown>;
    };

    if (!body.run_id?.trim()) return json(400, { success: false, error: "run_id is required." });
    if (!body.status) return json(400, { success: false, error: "status is required." });

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("video_generation_runs")
      .update({
        status: body.status,
        output_generation_id: body.output_generation_id ?? undefined,
        run_meta: body.run_meta ?? undefined,
      })
      .eq("id", body.run_id)
      .select("*")
      .single();

    if (error) return json(400, { success: false, error: error.message });
    return json(200, { success: true, data: { ...data, status: normalizeRunStatus(data.status) } });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
