import { NextResponse } from "next/server";
import { findBackendById, getDefaultBackendForType } from "@/lib/ai-backends";
import { runVeoVideo } from "@/lib/video/adapters/runVeoVideo";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { UploadSizeLimitError, uploadGeneratedVideoToSupabase } from "@/lib/supabaseStorageUpload";
import { type StudioAspectRatio } from "@/lib/studio/aspectRatios";
import {
  buildShotPrompt,
  buildVideoSimplePrompt,
  createEmptyGarmentAnchors,
  normalizeReferenceImagesForProvider,
  type VideoSimpleGarmentAnchors,
  type VideoSimpleMotionPreset,
  type VideoSimpleReferenceImage,
  type VideoSimpleShotType,
  type VideoSimpleWorkflowMode,
  VIDEO_SIMPLE_MOTION_PRESETS,
} from "@/lib/video/simpleControls";

type SimpleVideoGeneratePayload = {
  prompt?: string;
  duration_seconds?: number;
  aspect_ratio?: StudioAspectRatio;
  first_frame_url?: string | null;
  last_frame_url?: string | null;
  reference_images?: VideoSimpleReferenceImage[];
  motion_preset?: VideoSimpleMotionPreset;
  garment_anchors?: Partial<VideoSimpleGarmentAnchors>;
  workflow_mode?: VideoSimpleWorkflowMode;
  shot_type?: VideoSimpleShotType;
  workflow_group_id?: string | null;
  ai_backend_id?: string;
};

const SUPPORTED_DURATIONS = [4, 6, 8] as const;
const SUPPORTED_ASPECT_RATIOS = ["16:9", "9:16"] as const satisfies readonly StudioAspectRatio[];
type SupportedAspectRatio = (typeof SUPPORTED_ASPECT_RATIOS)[number];

function asJson(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function cleanUrl(value?: string | null) {
  if (!value) return null;
  const next = value.trim();
  return next.length ? next : null;
}

function isSupportedDuration(value: unknown): value is (typeof SUPPORTED_DURATIONS)[number] {
  return typeof value === "number" && SUPPORTED_DURATIONS.includes(value as (typeof SUPPORTED_DURATIONS)[number]);
}

function isSupportedAspectRatio(value: unknown): value is SupportedAspectRatio {
  return typeof value === "string" && SUPPORTED_ASPECT_RATIOS.includes(value as SupportedAspectRatio);
}

function isMotionPreset(value: unknown): value is VideoSimpleMotionPreset {
  return typeof value === "string" && VIDEO_SIMPLE_MOTION_PRESETS.includes(value as VideoSimpleMotionPreset);
}

function normalizeGarmentAnchors(value?: Partial<VideoSimpleGarmentAnchors>): VideoSimpleGarmentAnchors {
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

function normalizeWorkflowMode(value: unknown): VideoSimpleWorkflowMode {
  return value === "two-shot-back-reveal" ? "two-shot-back-reveal" : "single-shot";
}

function normalizeShotType(value: unknown, workflowMode: VideoSimpleWorkflowMode): VideoSimpleShotType {
  if (workflowMode === "two-shot-back-reveal" && (value === "shot-a" || value === "shot-b")) return value;
  return "single";
}

function cleanWorkflowGroupId(value: unknown) {
  if (typeof value !== "string") return null;
  const next = value.trim();
  return next.length ? next : null;
}

export async function POST(request: Request) {
  try {
    const googleApiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
    const supabaseBucket = process.env.SUPABASE_STORAGE_BUCKET ?? "brand-assets";

    if (!googleApiKey) {
      return asJson(500, { success: false, error: "Missing GOOGLE_API_KEY or GEMINI_API_KEY." });
    }

    let payload: SimpleVideoGeneratePayload;
    try {
      payload = (await request.json()) as SimpleVideoGeneratePayload;
    } catch {
      return asJson(400, { success: false, error: "Invalid JSON body." });
    }

    const prompt = payload.prompt?.trim();
    if (!prompt) {
      return asJson(400, { success: false, error: "Prompt is required." });
    }

    const durationSeconds = payload.duration_seconds ?? 6;
    if (!isSupportedDuration(durationSeconds)) {
      return asJson(400, { success: false, error: "Supported duration values are 4, 6, and 8 seconds." });
    }

    const aspectRatio = payload.aspect_ratio ?? "9:16";
    if (!isSupportedAspectRatio(aspectRatio)) {
      return asJson(400, { success: false, error: "Supported aspect ratios are 16:9 and 9:16." });
    }

    const backend = findBackendById(payload.ai_backend_id) ?? getDefaultBackendForType("video");
    const firstFrameUrl = cleanUrl(payload.first_frame_url);
    const lastFrameUrl = cleanUrl(payload.last_frame_url);

    const motionPreset = isMotionPreset(payload.motion_preset) ? payload.motion_preset : "freeform";
    const garmentAnchors = normalizeGarmentAnchors(payload.garment_anchors);
    const referenceImages = normalizeReferenceImagesForProvider(payload.reference_images ?? []);
    const workflowMode = normalizeWorkflowMode(payload.workflow_mode);
    const shotType = normalizeShotType(payload.shot_type, workflowMode);
    const workflowGroupId = cleanWorkflowGroupId(payload.workflow_group_id);

    const compiledPrompt =
      workflowMode === "two-shot-back-reveal"
        ? buildShotPrompt({
            creativePrompt: prompt,
            motionPreset,
            hasEndFrame: Boolean(lastFrameUrl),
            referenceImages,
            garmentAnchors,
            workflowMode,
            shotType,
          })
        : buildVideoSimplePrompt({
            creativePrompt: prompt,
            motionPreset,
            hasEndFrame: Boolean(lastFrameUrl),
            referenceImages,
            garmentAnchors,
          });

    const result = await runVeoVideo({
      apiKey: googleApiKey,
      model: backend.model,
      prompt: compiledPrompt,
      durationSeconds,
      aspectRatio,
      firstFrameUrl,
      lastFrameUrl,
      referenceImageUrls: referenceImages.map((item) => item.url),
    });

    const fileName = `${Date.now()}-simple-${durationSeconds}s.mp4`;
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
    const garmentAnchorCount = Object.values(garmentAnchors).filter((value) => value.trim().length > 0).length;
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
        reference_urls: referenceImages.map((item) => item.url),
        video_meta: {
          source: "video-simple",
          workflowMode,
          shotType,
          workflowGroupId,
          motionPreset,
          durationSeconds,
          aspectRatio,
          hasStartFrame: Boolean(firstFrameUrl),
          hasEndFrame: Boolean(lastFrameUrl),
          referenceCount: referenceImages.length,
          garmentAnchorCount,
        },
      })
      .select("id")
      .single();

    if (insertError) {
      throw new Error(`Failed to persist generation: ${insertError.message}`);
    }

    return asJson(200, {
      success: true,
      data: {
        generation_id: insertedGeneration.id,
        video_url: videoUrl,
        provider_output_uri: result.rawOutputUri,
        provider: "google-veo",
        model: backend.model,
        duration_seconds: durationSeconds,
        aspect_ratio: aspectRatio,
        compiled_prompt: compiledPrompt,
        controls: {
          motion_preset: motionPreset,
          reference_count: referenceImages.length,
          has_start_frame: Boolean(firstFrameUrl),
          has_end_frame: Boolean(lastFrameUrl),
          garment_anchor_count: garmentAnchorCount,
          workflow_mode: workflowMode,
          shot_type: shotType,
          workflow_group_id: workflowGroupId,
        },
      },
    });
  } catch (error) {
    if (error instanceof UploadSizeLimitError) {
      return asJson(413, {
        success: false,
        error_code: error.code,
        error: error.message,
        size_bytes: error.sizeBytes,
        size_mb: Number(error.sizeMb.toFixed(2)),
        max_bytes: error.maxBytes,
        max_mb: Number(error.maxMb.toFixed(2)),
      });
    }

    const message = error instanceof Error ? error.message : "Failed to generate simple video.";
    return asJson(500, { success: false, error: message });
  }
}
