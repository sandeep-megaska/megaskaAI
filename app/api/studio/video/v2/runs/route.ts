import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { runVideoJob } from "@/lib/video/runVideoJob";
import { getVideoCapabilityByBackendId } from "@/lib/video/providerCapabilities";
import { isStudioAspectRatio } from "@/lib/studio/aspectRatios";
import { buildPackReadinessReport } from "@/lib/video/v2/anchorPacks";
import { buildRecoveryRecommendation } from "@/lib/video/v2/recovery";
import { deriveFallbackProviderFromPlan, deriveProviderFromPlan, normalizeRunStatus, resolveRuntimeFrameUrls } from "@/lib/video/v2/runs";
import { buildCanonicalRunSnapshot, normalizePrompt, resolvePersistedRunPrompt } from "@/lib/video/v2/promptPropagation";
import { classifyOutputAsset, validatePlayableVideoOutput } from "@/lib/video/validateVideoOutput";
import { validateRuntimeExecution } from "@/lib/video/v2/fidelityRuntime";
import { buildRunConfigSignature, normalizeRunMode } from "@/lib/video/v2/runMode";
import { createValidationPreviewClip } from "@/lib/video/v2/validationPreview";
import { buildPhase2EvaluationRecord, isPhase2TemplateId, parsePhase2Evaluation, summarizePhase2TemplateHealth } from "@/lib/video/v2/phase2Evaluation";
import type {
  AnchorPack,
  AnchorPackItem,
  DirectorPlanContract,
  ExecuteVideoRunRequest,
  RunActionType,
  RetryStrategy,
  V2Mode,
  VideoRunHistoryRecord,
  VideoRunMode,
  VideoRunStatus,
} from "@/lib/video/v2/types";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function parseRunMeta(runMeta: unknown): Record<string, unknown> {
  if (!runMeta || typeof runMeta !== "object" || Array.isArray(runMeta)) return {};
  return runMeta as Record<string, unknown>;
}

function pickHttpUrl(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  }
  return null;
}

function findVideoUrlInNode(node: unknown, depth = 0): string | null {
  if (!node || depth > 7) return null;
  if (typeof node === "string") {
    const trimmed = node.trim();
    return trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : null;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findVideoUrlInNode(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== "object") return null;
  const record = node as Record<string, unknown>;
  const direct = pickHttpUrl([
    record.output_asset_url,
    record.asset_url,
    record.video_url,
    record.url,
    record.output_url,
    record.download_url,
    record.downloadUri,
    record.uri,
  ]);
  if (direct) return direct;
  for (const value of Object.values(record)) {
    const found = findVideoUrlInNode(value, depth + 1);
    if (found) return found;
  }
  return null;
}

function resolveOutputAssetUrl(input: { outputAssetUrl: string | null; runMeta: Record<string, unknown>; requestPayloadSnapshot?: Record<string, unknown> | null }) {
  const direct = pickHttpUrl([input.outputAssetUrl]);
  if (direct) return direct;
  const fromSnapshot = findVideoUrlInNode(input.requestPayloadSnapshot);
  if (fromSnapshot) return fromSnapshot;
  return findVideoUrlInNode(input.runMeta);
}

function extractOutputDurationSeconds(node: unknown): number | null {
  if (!node || typeof node !== "object" || Array.isArray(node)) return null;
  const record = node as Record<string, unknown>;
  const generatedVideo = record.generatedVideo && typeof record.generatedVideo === "object"
    ? (record.generatedVideo as Record<string, unknown>)
    : null;
  const candidates = [record.duration_seconds, record.durationSeconds, generatedVideo?.duration_seconds, generatedVideo?.durationSeconds];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
  }
  return null;
}

function simplifyPromptForSafeRetry(prompt: string) {
  const trimmed = prompt.trim();
  if (!trimmed) return "Generate a stable short motion clip from the source frame. Preserve subject identity and garment details.";
  return [
    "Create a stable short motion clip.",
    "Preserve subject identity, garment details, and scene continuity.",
    trimmed.slice(0, 900),
  ].join("\n");
}

function prefersVeo31(provider: string | null | undefined) {
  if (!provider) return false;
  return provider.startsWith("veo-3.1");
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

function isRunEligibleForSuccessActions(run: { status: VideoRunStatus; validation?: VideoRunHistoryRecord["validation"] | null }) {
  if (run.status !== "succeeded" && run.status !== "validated") return false;
  if (!run.validation) return true;
  return run.validation.decision === "pass" || run.validation.decision === "manual_review";
}

function parseRuntimeFidelity(snapshot: Record<string, unknown>) {
  const raw = snapshot.runtime_fidelity;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function parseTemplateMode(snapshot: Record<string, unknown>) {
  const raw = snapshot.template_mode;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
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
        ? supabase.from("video_generation_plans").select("id,motion_request,provider_order,director_prompt").in("id", planIds)
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
      let status: VideoRunStatus = validation ? "validated" : normalizeRunStatus(run.status);
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

      const requestPayloadSnapshot =
        runMeta.request_payload_snapshot && typeof runMeta.request_payload_snapshot === "object"
          ? (runMeta.request_payload_snapshot as Record<string, unknown>)
          : null;
      const persistedPrompt = resolvePersistedRunPrompt({
        requestPayloadSnapshot,
        runMeta,
        planDirectorPrompt: typeof plan?.director_prompt === "string" ? plan.director_prompt : null,
      });
      const hydratedRequestPayloadSnapshot = persistedPrompt
        ? { ...(requestPayloadSnapshot ?? {}), director_prompt: persistedPrompt }
        : requestPayloadSnapshot;
      const outputAssetUrl = resolveOutputAssetUrl({
        outputAssetUrl: output?.asset_url ?? output?.url ?? null,
        runMeta,
        requestPayloadSnapshot,
      });
      const row: VideoRunHistoryRecord = {
        ...run,
        status,
        plan_motion_request: planMap.get(run.generation_plan_id)?.motion_request ?? null,
        selected_pack_id: selectedPackId,
        selected_pack_name: selectedPackId ? (packMap.get(selectedPackId)?.pack_name ?? null) : null,
        request_payload_snapshot: hydratedRequestPayloadSnapshot,
        prompt_used: persistedPrompt,
        output_asset_url: outputAssetUrl,
        full_output_asset_url: outputAssetUrl,
        output_thumbnail_url: output?.thumbnail_url ?? null,
        output_generation_status: output?.status ?? null,
        failure_message: typeof runMeta.failure_message === "string" ? runMeta.failure_message : null,
        retried_from_run_id: typeof runMeta.retried_from_run_id === "string" ? runMeta.retried_from_run_id : null,
        retry_strategy: typeof runMeta.retry_strategy === "string" ? (runMeta.retry_strategy as RetryStrategy) : null,
        retry_reason: typeof runMeta.retry_reason === "string" ? runMeta.retry_reason : null,
        continuation: Boolean(runMeta.continuation),
        source_run_id: typeof runMeta.source_run_id === "string" ? runMeta.source_run_id : null,
        extension_type: runMeta.extension_type === "scene_extension" ? "scene_extension" : null,
        branched_from_run_id: typeof runMeta.branched_from_run_id === "string" ? runMeta.branched_from_run_id : null,
        branch_type: runMeta.branch_type === "next_shot" ? "next_shot" : null,
        accepted_for_sequence: Boolean(runMeta.accepted_for_sequence),
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
      const outputValidation =
        runMeta.output_validation && typeof runMeta.output_validation === "object"
          ? (runMeta.output_validation as Record<string, unknown>)
          : null;
      if (status === "succeeded" && outputValidation?.valid === false) {
        status = "failed";
        row.status = "failed";
        row.failure_message = "Provider returned an unplayable video output.";
      }
      row.output_validation = outputValidation;
      row.file_type = typeof outputValidation?.contentType === "string" ? outputValidation.contentType : null;
      row.run_mode = normalizeRunMode(runMeta.run_mode);
      row.preview_asset_url = typeof runMeta.preview_asset_url === "string" ? runMeta.preview_asset_url : null;
      row.auto_trim_produced = Boolean(runMeta.auto_trim_produced);
      if (row.run_mode === "validation" && row.preview_asset_url) {
        row.output_asset_url = row.preview_asset_url;
      }

      const runAspectRatio = String(row.request_payload_snapshot?.aspect_ratio ?? "9:16");
      const providerCapability = getVideoCapabilityByBackendId(row.provider_used);
      if (!isRunEligibleForSuccessActions(row)) {
        row.continuation_allowed = false;
        row.continuation_block_reason = "Run not eligible";
      } else if (!row.output_asset_url) {
        row.continuation_allowed = false;
        row.continuation_block_reason = "No output video";
      } else if (!providerCapability?.supportsLastFrame) {
        row.continuation_allowed = false;
        row.continuation_block_reason = "Provider does not support extension";
      } else if (!providerCapability.allowedAspectRatios.includes(runAspectRatio as "16:9" | "9:16")) {
        row.continuation_allowed = false;
        row.continuation_block_reason = "Resolution/aspect ratio incompatible";
      } else {
        row.continuation_allowed = true;
        row.continuation_block_reason = null;
      }

      row.recovery_recommendation = buildRecoveryRecommendation({
        run: row,
        packReadiness,
        fallbackProvider: fallback,
        fallbackModel: fallback,
      });
      const phase2Evaluation = parsePhase2Evaluation(runMeta.phase2_evaluation);
      row.phase2_evaluation = phase2Evaluation;
      row.phase2_template_health =
        runMeta.phase2_template_health && typeof runMeta.phase2_template_health === "object" && !Array.isArray(runMeta.phase2_template_health)
          ? (runMeta.phase2_template_health as VideoRunHistoryRecord["phase2_template_health"])
          : null;
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

    if ((body.action_type === "branch" || body.action_type === "branch_run") && body.source_run_id?.trim()) {
      const { data: sourceRun, error: sourceError } = await supabase.from("video_generation_runs").select("*").eq("id", body.source_run_id).single();
      if (sourceError || !sourceRun) return json(404, { success: false, error: sourceError?.message ?? "Source run not found." });
      if (normalizeRunStatus(sourceRun.status) === "failed") return json(400, { success: false, error: "Run not eligible" });
      const sourceMeta = parseRunMeta(sourceRun.run_meta);
      const inheritedSnapshot =
        sourceMeta.request_payload_snapshot && typeof sourceMeta.request_payload_snapshot === "object"
          ? (sourceMeta.request_payload_snapshot as Record<string, unknown>)
          : {};

      return json(200, {
        success: true,
        data: {
          action_type: "branch" satisfies RunActionType,
          source_run_id: sourceRun.id,
          planner_prefill: {
            selected_pack_id: sourceMeta.selected_pack_id ?? null,
            suggested_motion_request: inheritedSnapshot.director_prompt ?? null,
            suggested_mode: sourceRun.mode_selected,
            aspect_ratio: inheritedSnapshot.aspect_ratio ?? "9:16",
            duration_seconds: inheritedSnapshot.duration_seconds ?? 8,
            provider_selected: sourceRun.provider_used ?? null,
            model_selected: sourceRun.provider_model ?? sourceRun.provider_used ?? null,
          },
          lineage_meta: {
            branched_from_run_id: sourceRun.id,
            branch_type: "next_shot",
          },
        },
      });
    }

    if (body.source_run_id?.trim()) {
      const isExtensionAction = body.action_type === "extend" || body.action_type === "extend_run";
      const retryStrategy = pickRetryStrategy(body.retry_strategy);
      const { data: sourceRun, error: sourceError } = await supabase.from("video_generation_runs").select("*").eq("id", body.source_run_id).single();
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

      const inheritedSnapshot =
        sourceMeta.request_payload_snapshot && typeof sourceMeta.request_payload_snapshot === "object"
          ? (sourceMeta.request_payload_snapshot as Record<string, unknown>)
          : {};

      if (isExtensionAction) {
        if (normalizeRunStatus(sourceRun.status) === "failed") return json(400, { success: false, error: "Run not eligible" });
        const continuationPrompt = String(body.continuation_prompt ?? "").trim();
        if (!continuationPrompt) return json(400, { success: false, error: "continuation_prompt is required for extension." });
        const { data: sourceOutput } = await supabase.from("generations").select("id,asset_url,url").eq("id", sourceRun.output_generation_id).maybeSingle();
        if (!(sourceOutput?.asset_url ?? sourceOutput?.url ?? null)) return json(400, { success: false, error: "No output video" });
        const providerCapability = getVideoCapabilityByBackendId(sourceRun.provider_used);
        if (!providerCapability?.supportsLastFrame) return json(400, { success: false, error: "Provider does not support extension" });
        const sourceAspect = String(inheritedSnapshot.aspect_ratio ?? "9:16");
        if (!providerCapability.allowedAspectRatios.includes(sourceAspect as "16:9" | "9:16")) {
          return json(400, { success: false, error: "Resolution/aspect ratio incompatible" });
        }

        const duration = Number(body.duration_seconds ?? inheritedSnapshot.duration_seconds ?? 6);
        runRequest = {
          generation_plan_id: sourceRun.generation_plan_id,
          selected_pack_id: selectedPackId,
          mode_selected: "scene_extension",
          provider_selected: String(sourceRun.provider_used ?? "veo-3.1"),
          model_selected: String(sourceRun.provider_model ?? sourceRun.provider_used ?? "veo-3.1"),
          director_prompt: continuationPrompt,
          fallback_prompt: String(inheritedSnapshot.fallback_prompt ?? plan.fallback_prompt ?? ""),
          aspect_ratio: String(inheritedSnapshot.aspect_ratio ?? plan.aspect_ratio ?? "9:16"),
          duration_seconds: duration,
          request_payload_snapshot: {
            ...inheritedSnapshot,
            continuation_prompt: continuationPrompt,
            duration_seconds: duration,
            source_output_generation_id: sourceRun.output_generation_id,
            source_output_asset_url: sourceOutput?.asset_url ?? sourceOutput?.url ?? null,
            source_run_id: sourceRun.id,
            extension_type: "scene_extension",
            new_seed: body.new_seed ?? null,
          },
          source_run_id: sourceRun.id,
          retry_strategy: "same_plan",
          retry_reason: "Operator-triggered scene extension.",
          action_type: "extend",
          run_mode: normalizeRunMode(body.run_mode ?? inheritedSnapshot.run_mode),
        };
      } else {
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
          action_type: "retry",
          run_mode: normalizeRunMode(body.run_mode ?? inheritedSnapshot.run_mode),
        };
      }
    }

    if (!runRequest.generation_plan_id?.trim()) return json(400, { success: false, error: "generation_plan_id is required." });
    if (!runRequest.selected_pack_id?.trim()) return json(400, { success: false, error: "selected_pack_id is required." });
    if (!runRequest.mode_selected?.trim()) return json(400, { success: false, error: "mode_selected is required." });
    const canonicalDirectorPrompt = normalizePrompt(runRequest.director_prompt);
    if (!canonicalDirectorPrompt) return json(400, { success: false, error: "Cannot execute video run: compiled prompt is missing." });

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

    const requestPayloadSnapshot = buildCanonicalRunSnapshot({
      requestPayloadSnapshot: runRequest.request_payload_snapshot ?? {},
      directorPrompt: canonicalDirectorPrompt,
      fallbackPrompt: runRequest.fallback_prompt ?? plan.fallback_prompt ?? null,
      modeSelected: runRequest.mode_selected,
      providerSelected: providerInfo.providerSelected,
      modelSelected: providerInfo.modelSelected,
      anchorCount: Array.isArray(pack.anchor_pack_items) ? pack.anchor_pack_items.length : undefined,
    });
    const runtimeFidelity = parseRuntimeFidelity(requestPayloadSnapshot);
    const templateMode = parseTemplateMode(requestPayloadSnapshot);
    const runMode: VideoRunMode = normalizeRunMode(runRequest.run_mode);
    if (runMode === "validation" && templateMode?.production_mode !== "phase1_template") {
      return json(400, { success: false, error: "Validation mode requires Phase-1 Template mode for safety." });
    }
    const exactEndStateRequired = Boolean(runtimeFidelity?.exact_end_state_required);
    const startFrameGenerationId =
      typeof runtimeFidelity?.start_frame_generation_id === "string" ? runtimeFidelity.start_frame_generation_id : null;
    const endFrameGenerationId =
      typeof runtimeFidelity?.end_frame_generation_id === "string" ? runtimeFidelity.end_frame_generation_id : null;
    try {
      validateRuntimeExecution({
        exactEndStateRequired,
        modeSelected: runRequest.mode_selected,
        startFrameGenerationId,
        endFrameGenerationId,
        canonicalDirectorPrompt,
      });
    } catch (error) {
      return json(400, { success: false, error: error instanceof Error ? error.message : "Run validation failed." });
    }

    const phase2TemplateId = typeof templateMode?.template_id === "string" && isPhase2TemplateId(templateMode.template_id)
      ? templateMode.template_id
      : null;

    const initialMeta: Record<string, unknown> = {
      selected_pack_id: runRequest.selected_pack_id,
      prompt_used: canonicalDirectorPrompt,
      mode_selected: runRequest.mode_selected,
      provider_selected: providerInfo.providerSelected,
      model_selected: providerInfo.modelSelected,
      fallback_prompt: normalizePrompt(runRequest.fallback_prompt ?? plan.fallback_prompt ?? null),
      request_payload_snapshot: requestPayloadSnapshot,
      execution_notes: "Run accepted by V2 execute endpoint.",
      retried_from_run_id: runRequest.source_run_id ?? null,
      retry_strategy: runRequest.retry_strategy ?? null,
      retry_reason: runRequest.retry_reason ?? null,
      accepted_for_sequence: false,
      continuation: runRequest.action_type === "extend",
      source_run_id: runRequest.action_type === "extend" ? runRequest.source_run_id ?? null : null,
      extension_type: runRequest.action_type === "extend" ? "scene_extension" : null,
      branched_from_run_id: runRequest.lineage_meta?.branched_from_run_id ?? null,
      branch_type: runRequest.lineage_meta?.branch_type ?? null,
      original_mode_selected: runRequest.source_run_id ? plan.mode_selected : null,
      retry_mode_selected: runRequest.source_run_id ? runRequest.mode_selected : null,
      run_mode: runMode,
      phase2_template_run: Boolean(phase2TemplateId),
      phase2_template_id: phase2TemplateId,
      phase2_evaluation_mode: phase2TemplateId ? "phase2" : null,
      config_signature: buildRunConfigSignature({
        selectedPackId: runRequest.selected_pack_id,
        modeSelected: runRequest.mode_selected,
        providerSelected: providerInfo.providerSelected,
        modelSelected: providerInfo.modelSelected,
        aspectRatio: String(runRequest.aspect_ratio ?? plan.aspect_ratio ?? "9:16"),
        runMode,
        directorPrompt: canonicalDirectorPrompt,
        productionMode: typeof templateMode?.production_mode === "string" ? templateMode.production_mode : null,
        phase1TemplateId: typeof templateMode?.template_id === "string" ? templateMode.template_id : null,
      }),
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

    const extensionSourceVideoUrl =
      typeof (requestPayloadSnapshot as Record<string, unknown>).source_output_asset_url === "string"
        ? ((requestPayloadSnapshot as Record<string, unknown>).source_output_asset_url as string)
        : null;
    const runtimeFrames = resolveRuntimeFrameUrls({
      pack: pack as AnchorPack,
      startFrameGenerationId,
      endFrameGenerationId,
      startFrameRole: typeof runtimeFidelity?.start_frame_role === "string" ? runtimeFidelity.start_frame_role : null,
      endFrameRole: typeof runtimeFidelity?.end_frame_role === "string" ? runtimeFidelity.end_frame_role : null,
    });
    const primaryFrameUrl = runRequest.action_type === "extend" ? extensionSourceVideoUrl : runtimeFrames.startFrameUrl;
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
      const requestedDuration = Number(runRequest.duration_seconds ?? plan.duration_seconds ?? 8);
      const execution = await runVideoJob({
        backendId: providerInfo.providerSelected,
        prompt: canonicalDirectorPrompt,
        durationSeconds: requestedDuration,
        firstFrameUrl: primaryFrameUrl,
        lastFrameUrl: runtimeFrames.endFrameUrl,
        aspectRatio: isStudioAspectRatio(selectedAspectRatio) ? selectedAspectRatio : "9:16",
        requestedFidelityPriority: "maximum-fidelity",
        inputMode: "anchor-based",
      });
      let finalExecution = execution;
      let safeRetryApplied = false;

      const initialOutputUrl = pickHttpUrl([
        execution.rawOutputUri,
        (execution.providerResponseMeta.generatedVideo as Record<string, unknown> | undefined)?.downloadUri,
        (execution.providerResponseMeta.generatedVideo as Record<string, unknown> | undefined)?.uri,
      ]);
      const initialValidation = validatePlayableVideoOutput({
        provider: execution.backendId,
        outputUrl: initialOutputUrl,
        mimeType: execution.mimeType,
        bytesLength: execution.bytes.length,
        durationSeconds: extractOutputDurationSeconds(execution.providerResponseMeta),
      });

      if (!initialValidation.valid && prefersVeo31(providerInfo.providerSelected)) {
        safeRetryApplied = true;
        const saferDuration = requestedDuration >= 8 ? 6 : requestedDuration;
        finalExecution = await runVideoJob({
          backendId: providerInfo.providerSelected,
          prompt: simplifyPromptForSafeRetry(canonicalDirectorPrompt),
          durationSeconds: saferDuration,
          firstFrameUrl: primaryFrameUrl,
          lastFrameUrl: runtimeFrames.endFrameUrl,
          aspectRatio: isStudioAspectRatio(selectedAspectRatio) ? selectedAspectRatio : "9:16",
          requestedFidelityPriority: "balanced",
          inputMode: "anchor-based",
        });
      }

      const outputAssetUrl = pickHttpUrl([
        finalExecution.rawOutputUri,
        (finalExecution.providerResponseMeta.generatedVideo as Record<string, unknown> | undefined)?.downloadUri,
        (finalExecution.providerResponseMeta.generatedVideo as Record<string, unknown> | undefined)?.uri,
      ]);
      const outputValidation = validatePlayableVideoOutput({
        provider: finalExecution.backendId,
        outputUrl: outputAssetUrl,
        mimeType: finalExecution.mimeType,
        bytesLength: finalExecution.bytes.length,
        durationSeconds: extractOutputDurationSeconds(finalExecution.providerResponseMeta),
      });
      const outputClassification = classifyOutputAsset({
        expectedOutputKind: "video",
        mimeType: finalExecution.mimeType,
        url: outputAssetUrl,
      });
      if (process.env.NODE_ENV !== "production") {
        console.log("[video-v2] output classification diagnostics", outputClassification);
        console.log("[video-v2] output validation diagnostics", {
          provider: finalExecution.backendId,
          outputUrlPresent: Boolean(outputAssetUrl),
          urlReachable: outputValidation.checks.retrievable,
          contentType: finalExecution.mimeType,
          fileSizeBytes: finalExecution.bytes.length,
          durationSeconds: outputValidation.observed.durationSeconds,
          playable_video: outputValidation.valid,
          safeRetryApplied,
        });
      }

      const storageBucket = process.env.SUPABASE_STORAGE_BUCKET ?? "brand-assets";
      const fileName = `videos/${insertedRun.id}.mp4`;
      console.log("[video-v2-upload]", {
        bucket: storageBucket,
        fileSize: finalExecution.bytes.length,
        mimeType: finalExecution.mimeType,
      });
      const { error: uploadError } = await supabase.storage
        .from(storageBucket)
        .upload(fileName, finalExecution.bytes, {
          contentType: "video/mp4",
          upsert: true,
        });

      if (uploadError) {
        throw new Error(`Video upload failed: ${uploadError.message}`);
      }

      const { data: publicUrlData } = supabase.storage
        .from(storageBucket)
        .getPublicUrl(fileName);

      const publicUrl = publicUrlData.publicUrl;
      let previewMeta: {
        autoTrimProduced: boolean;
        previewAssetUrl: string | null;
        previewDurationSeconds: number;
      } | null = null;
      if (runMode === "validation") {
        try {
          const preview = await createValidationPreviewClip({
            supabase,
            bucket: storageBucket,
            runId: insertedRun.id,
            videoBytes: finalExecution.bytes,
            previewSeconds: 3,
          });
          previewMeta = {
            autoTrimProduced: preview.autoTrimProduced,
            previewAssetUrl: preview.previewAssetUrl ?? null,
            previewDurationSeconds: preview.previewDurationSeconds,
          };
        } catch (previewError) {
          previewMeta = {
            autoTrimProduced: false,
            previewAssetUrl: null,
            previewDurationSeconds: 3,
          };
          if (process.env.NODE_ENV !== "production") {
            console.warn("[video-v2] validation preview generation failed", previewError);
          }
        }
      }

      const generationInsertPayload = {
        prompt: canonicalDirectorPrompt,
        type: "Video",
        media_type: "Video",
        status: "completed",
        aspect_ratio: runRequest.aspect_ratio ?? plan.aspect_ratio ?? "9:16",
        asset_url: publicUrl,
        url: publicUrl,
        generation_kind: "video",
        source_generation_id: null,
        thumbnail_url: null,
        video_meta: {
          provider: finalExecution.provider,
          backendId: finalExecution.backendId,
          backendModel: finalExecution.backendModel,
          providerModelId: finalExecution.providerModelId,
          providerResponse: finalExecution.providerResponseMeta,
          original_provider_url: outputAssetUrl,
          note: "V2 slice 3A stores provider execution metadata and Supabase binary upload URL.",
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
        provider_response: finalExecution.providerResponseMeta,
        diagnostics: finalExecution.diagnostics,
        output_validation: {
          classification: outputClassification,
          valid: outputValidation.valid,
          errorMessage: outputValidation.errorMessage,
          checks: outputValidation.checks,
          contentType: outputValidation.observed.contentType,
          fileSizeBytes: outputValidation.observed.fileSizeBytes,
          durationSeconds: outputValidation.observed.durationSeconds,
        },
        safe_retry: {
          attempted: safeRetryApplied,
          provider_family: providerInfo.providerSelected,
          strategy: "same_provider_veo_3_1",
        },
        preview_asset_url: previewMeta?.previewAssetUrl ?? null,
        full_output_asset_url: publicUrl,
        auto_trim_produced: previewMeta?.autoTrimProduced ?? false,
        preview_duration_seconds: previewMeta?.previewDurationSeconds ?? null,
        execution_notes: "Provider execution completed; output metadata persisted.",
      };

      if (!outputValidation.valid) {
        const failMeta = {
          ...successMeta,
          failure_message: outputValidation.errorMessage,
        };
        const { data: failedRun, error: failedUpdateError } = await supabase
          .from("video_generation_runs")
          .update({
            status: "failed",
            output_generation_id: outputGeneration.id,
            run_meta: failMeta,
          })
          .eq("id", insertedRun.id)
          .select("*")
          .single();
        if (failedUpdateError || !failedRun) {
          return json(201, {
            success: true,
            data: { ...insertedRun, status: "failed", output_generation_id: outputGeneration.id, run_meta: failMeta, failure_message: outputValidation.errorMessage },
          });
        }
        return json(201, { success: true, data: { ...failedRun, failure_message: outputValidation.errorMessage } });
      }

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
      action_type?: "accept" | "phase2_evaluate";
      accepted_for_sequence?: boolean;
      evaluation?: {
        template_id?: string;
        garment_truth_ok?: boolean;
        identity_stable?: boolean;
        motion_within_template?: boolean;
        commercially_usable?: boolean;
        reviewer_notes?: string | null;
      };
    };

    if (!body.run_id?.trim()) return json(400, { success: false, error: "run_id is required." });

    const supabase = getSupabaseAdminClient();
    if (body.action_type === "accept") {
      const { data: existingRun, error: existingError } = await supabase
        .from("video_generation_runs")
        .select("id,run_meta,status")
        .eq("id", body.run_id)
        .single();
      if (existingError || !existingRun) return json(404, { success: false, error: existingError?.message ?? "Run not found." });
      const existingMeta = parseRunMeta(existingRun.run_meta);
      const nextMeta = {
        ...existingMeta,
        accepted_for_sequence: body.accepted_for_sequence ?? true,
      };
      const { data, error } = await supabase
        .from("video_generation_runs")
        .update({ run_meta: nextMeta })
        .eq("id", body.run_id)
        .select("*")
        .single();
      if (error) return json(400, { success: false, error: error.message });
      return json(200, { success: true, data: { ...data, status: normalizeRunStatus(data.status) } });
    }
    if (body.action_type === "phase2_evaluate") {
      const { data: existingRun, error: existingError } = await supabase
        .from("video_generation_runs")
        .select("id,created_at,run_meta")
        .eq("id", body.run_id)
        .single();
      if (existingError || !existingRun) return json(404, { success: false, error: existingError?.message ?? "Run not found." });
      const existingMeta = parseRunMeta(existingRun.run_meta);
      const snapshot =
        existingMeta.request_payload_snapshot && typeof existingMeta.request_payload_snapshot === "object" && !Array.isArray(existingMeta.request_payload_snapshot)
          ? (existingMeta.request_payload_snapshot as Record<string, unknown>)
          : {};
      const templateMode = parseTemplateMode(snapshot);
      const templateId =
        typeof body.evaluation?.template_id === "string" && body.evaluation.template_id.trim()
          ? body.evaluation.template_id
          : typeof templateMode?.template_id === "string"
            ? templateMode.template_id
            : typeof existingMeta.phase2_template_id === "string"
              ? existingMeta.phase2_template_id
              : null;
      if (!isPhase2TemplateId(templateId)) {
        return json(400, { success: false, error: "Phase-2 evaluation is only supported for controlled templates." });
      }

      const { data: siblingRuns } = await supabase
        .from("video_generation_runs")
        .select("id,run_meta")
        .order("created_at", { ascending: false })
        .limit(120);

      const priorEvaluations = (siblingRuns ?? [])
        .filter((run) => run.id !== body.run_id)
        .map((run) => parseRunMeta(run.run_meta).phase2_evaluation)
        .map((entry) => parsePhase2Evaluation(entry))
        .filter((entry): entry is NonNullable<ReturnType<typeof parsePhase2Evaluation>> => Boolean(entry && entry.template_id === templateId));
      const health = summarizePhase2TemplateHealth(priorEvaluations);
      const nextEvaluation = buildPhase2EvaluationRecord({
        template_id: templateId,
        garment_truth_ok: Boolean(body.evaluation?.garment_truth_ok),
        identity_stable: Boolean(body.evaluation?.identity_stable),
        motion_within_template: Boolean(body.evaluation?.motion_within_template),
        commercially_usable: Boolean(body.evaluation?.commercially_usable),
        reviewer_notes: body.evaluation?.reviewer_notes,
        health,
      });
      const nextHealth = summarizePhase2TemplateHealth([...priorEvaluations, nextEvaluation]);
      const nextMeta = {
        ...existingMeta,
        phase2_template_run: true,
        phase2_template_id: templateId,
        phase2_evaluation_mode: "phase2",
        phase2_evaluation: {
          ...nextEvaluation,
          retry_recommendation: nextEvaluation.retry_recommendation,
        },
        phase2_template_health: nextHealth,
      };
      const { data, error } = await supabase
        .from("video_generation_runs")
        .update({ run_meta: nextMeta })
        .eq("id", body.run_id)
        .select("*")
        .single();
      if (error) return json(400, { success: false, error: error.message });
      return json(200, { success: true, data: { ...data, status: normalizeRunStatus(data.status) } });
    }

    if (!body.status) return json(400, { success: false, error: "status is required." });

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
