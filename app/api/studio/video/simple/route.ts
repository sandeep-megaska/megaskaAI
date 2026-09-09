import { NextResponse } from "next/server";
import { findBackendById, getDefaultBackendForType, resolveActiveBackend } from "@/lib/ai-backends";
import {
  ProviderInvalidArgumentError,
  ProviderModelNotFoundError,
  ProviderUnavailableError,
} from "@/lib/ai/providerErrors";
import { isGarmentViewRole, type GarmentViewRole } from "@/lib/garment/roles";
import { type StudioAspectRatio } from "@/lib/studio/aspectRatios";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { UploadSizeLimitError, uploadGeneratedVideoToSupabase } from "@/lib/supabaseStorageUpload";
import {
  assessFidelity,
  planConditioning,
  type ConditioningImage,
  type ConditioningMode,
} from "@/lib/video/veo/conditioning";
import { generateVeoVideo, VideoGenerationOutputError } from "@/lib/video/veo/generate";
import {
  buildNegativePrompt,
  compileVideoPrompt,
  createEmptyGarmentAnchors,
  detectsTurnIntent,
  MOTION_PRESETS,
  type GarmentAnchors,
  type MotionPreset,
} from "@/lib/video/veo/prompt";

type ImageInput = { url?: string; role?: string; label?: string };

type GenerateVideoPayload = {
  prompt?: string;
  duration_seconds?: number;
  aspect_ratio?: StudioAspectRatio;
  resolution?: "720p" | "1080p";
  start_frame?: ImageInput | null;
  end_frame?: ImageInput | null;
  reference_images?: ImageInput[];
  motion_preset?: string;
  garment_anchors?: Partial<GarmentAnchors>;
  garment_description?: string;
  sku_code?: string | null;
  /** Force a conditioning mode instead of letting the planner choose. */
  conditioning_mode?: ConditioningMode;
  negative_prompt?: string;
  seed?: number;
  ai_backend_id?: string;
  /** Groups the halves of a split turn so they can be found together later. */
  shot_group_id?: string | null;
  shot_label?: string | null;
};

const SUPPORTED_DURATIONS = [4, 6, 8] as const;
const SUPPORTED_ASPECT_RATIOS = ["16:9", "9:16"] as const satisfies readonly StudioAspectRatio[];

function asJson(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function toConditioningImage(input: ImageInput | null | undefined): ConditioningImage | null {
  const url = input?.url?.trim();
  if (!url) return null;
  const role: GarmentViewRole | undefined = isGarmentViewRole(input?.role) ? input.role : undefined;
  return { url, role, label: input?.label?.trim() || undefined };
}

function normalizeAnchors(value?: Partial<GarmentAnchors>): GarmentAnchors {
  const base = createEmptyGarmentAnchors();
  return {
    backNeckline: value?.backNeckline?.trim() ?? base.backNeckline,
    strapStructure: value?.strapStructure?.trim() ?? base.strapStructure,
    backCoverage: value?.backCoverage?.trim() ?? base.backCoverage,
    seamLines: value?.seamLines?.trim() ?? base.seamLines,
    fabricFinish: value?.fabricFinish?.trim() ?? base.fabricFinish,
    colorContinuity: value?.colorContinuity?.trim() ?? base.colorContinuity,
  };
}

function isMotionPreset(value: unknown): value is MotionPreset {
  return typeof value === "string" && (MOTION_PRESETS as readonly string[]).includes(value);
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    const googleApiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
    const supabaseBucket = process.env.SUPABASE_STORAGE_BUCKET ?? "brand-assets";

    if (!googleApiKey) {
      return asJson(500, { success: false, error: "Missing GOOGLE_API_KEY or GEMINI_API_KEY." });
    }

    let payload: GenerateVideoPayload;
    try {
      payload = (await request.json()) as GenerateVideoPayload;
    } catch {
      return asJson(400, { success: false, error: "Invalid JSON body." });
    }

    const prompt = payload.prompt?.trim();
    if (!prompt) return asJson(400, { success: false, error: "A prompt is required." });

    const durationSeconds = payload.duration_seconds ?? 6;
    if (!SUPPORTED_DURATIONS.includes(durationSeconds as (typeof SUPPORTED_DURATIONS)[number])) {
      return asJson(400, { success: false, error: "Supported durations are 4, 6 and 8 seconds." });
    }

    const aspectRatio = payload.aspect_ratio ?? "9:16";
    if (!SUPPORTED_ASPECT_RATIOS.includes(aspectRatio as (typeof SUPPORTED_ASPECT_RATIOS)[number])) {
      return asJson(400, { success: false, error: "Supported aspect ratios are 16:9 and 9:16." });
    }

    const backend = resolveActiveBackend(findBackendById(payload.ai_backend_id) ?? getDefaultBackendForType("video"));
    const preset: MotionPreset = isMotionPreset(payload.motion_preset) ? payload.motion_preset : "product-turn";
    const anchors = normalizeAnchors(payload.garment_anchors);

    // One valid conditioning shape, chosen here rather than assembled ad hoc at
    // the provider call. The planner is what stops reference images being sent
    // alongside frame conditioning, which the API rejects.
    const plan = planConditioning({
      startFrame: toConditioningImage(payload.start_frame),
      endFrame: toConditioningImage(payload.end_frame),
      references: (payload.reference_images ?? [])
        .map(toConditioningImage)
        .filter((image): image is ConditioningImage => Boolean(image)),
      preferred: payload.conditioning_mode,
    });

    const turnIntent = detectsTurnIntent(prompt, preset);
    const fidelity = assessFidelity(plan, { turnIntent });

    const compiledPrompt = compileVideoPrompt({
      creativePrompt: prompt,
      preset,
      plan,
      anchors,
      garmentDescription: payload.garment_description,
    });
    const negativePrompt = buildNegativePrompt(payload.negative_prompt);

    const result = await generateVeoVideo({
      apiKey: googleApiKey,
      model: backend.model,
      prompt: compiledPrompt,
      negativePrompt,
      plan,
      aspectRatio,
      durationSeconds,
      resolution: payload.resolution,
      seed: payload.seed,
    });

    const fileName = `${Date.now()}-clip-${durationSeconds}s.mp4`;
    const filePath = `video/${fileName}`;
    const uploaded = await uploadGeneratedVideoToSupabase({
      bucket: supabaseBucket,
      bytes: result.bytes,
      fileName,
      filePath,
      mimeType: result.mimeType || "video/mp4",
    });
    const videoUrl = uploaded.publicUrl;

    const supabase = getSupabaseAdminClient();
    const anchorCount = Object.values(anchors).filter((value) => value.trim().length > 0).length;

    const { data: insertedGeneration, error: insertError } = await supabase
      .from("generations")
      .insert({
        prompt,
        type: "video",
        media_type: "video",
        status: "completed",
        aspect_ratio: aspectRatio,
        asset_url: videoUrl,
        url: videoUrl,
        generation_kind: "video",
        reference_urls: [plan.startFrame?.url, plan.endFrame?.url, ...plan.references.map((r) => r.url)].filter(
          Boolean,
        ),
        video_meta: {
          source: "video-simple",
          skuCode: payload.sku_code?.trim()?.toUpperCase() ?? null,
          shotGroupId: payload.shot_group_id ?? null,
          shotLabel: payload.shot_label ?? null,
          conditioningMode: plan.mode,
          conditioningRationale: plan.rationale,
          startFrameRole: plan.startFrame?.role ?? null,
          endFrameRole: plan.endFrame?.role ?? null,
          referenceRoles: plan.references.map((reference) => reference.role ?? null),
          motionPreset: preset,
          durationSeconds,
          aspectRatio,
          resolution: payload.resolution ?? null,
          turnIntent,
          fidelityRisk: fidelity.risk,
          uncoveredDegrees: fidelity.uncoveredDegrees,
          garmentAnchorCount: anchorCount,
          providerModel: result.resolvedModel,
        },
      })
      .select("id")
      .single();

    if (insertError) throw new Error(`Failed to save the generation record: ${insertError.message}`);

    return asJson(200, {
      success: true,
      data: {
        generation_id: insertedGeneration.id,
        video_url: videoUrl,
        provider: "google-veo",
        model: result.resolvedModel,
        requested_model: backend.model,
        duration_seconds: durationSeconds,
        aspect_ratio: aspectRatio,
        compiled_prompt: compiledPrompt,
        negative_prompt: negativePrompt,
        conditioning: {
          mode: plan.mode,
          rationale: plan.rationale,
          start_frame_role: plan.startFrame?.role ?? null,
          end_frame_role: plan.endFrame?.role ?? null,
          reference_count: plan.references.length,
          dropped: plan.dropped.map((entry) => ({ url: entry.image.url, reason: entry.reason })),
        },
        fidelity,
        controls: {
          motion_preset: preset,
          garment_anchor_count: anchorCount,
          shot_group_id: payload.shot_group_id ?? null,
          shot_label: payload.shot_label ?? null,
        },
      },
    });
  } catch (error) {
    if (error instanceof ProviderModelNotFoundError) {
      return asJson(404, { success: false, error_code: "model-not-found", error: error.message });
    }

    if (error instanceof ProviderInvalidArgumentError) {
      return asJson(400, {
        success: false,
        error_code: "rejected-params",
        error:
          "The provider rejected these settings. Try a shorter duration, fewer reference images, or a gentler motion preset.",
      });
    }

    if (error instanceof ProviderUnavailableError) {
      return asJson(503, {
        success: false,
        error_code: error.errorCode,
        error: "The video service is busy right now. Please retry.",
      });
    }

    if (error instanceof UploadSizeLimitError) {
      return asJson(413, {
        success: false,
        error_code: error.code,
        error: error.message,
        size_bytes: error.sizeBytes,
        size_mb: Number(error.sizeMb.toFixed(2)),
        max_bytes: error.maxBytes,
        max_mb: Number(error.maxMb.toFixed(2)),
        limit_source: error.limitSource,
        limit_known: error.limitKnown,
      });
    }

    if (error instanceof VideoGenerationOutputError) {
      return asJson(502, {
        success: false,
        error_code: error.code,
        error: error.message,
        diagnostics: error.diagnostics,
      });
    }

    return asJson(500, {
      success: false,
      error: error instanceof Error ? error.message : "Video generation failed.",
    });
  } finally {
    console.log("[studio/video/simple] completed", { elapsedMs: Date.now() - startedAt });
  }
}
