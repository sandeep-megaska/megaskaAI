import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  ProviderInvalidArgumentError,
  ProviderUnavailableError,
  isGeminiUnavailableError,
} from "@/lib/ai/providerErrors";
import { isStudioAspectRatio, type StudioAspectRatio } from "@/lib/studio/aspectRatios";
import {
  getMotionPresetCategory,
  VIDEO_DURATIONS,
  VIDEO_MOTION_PRESETS,
  VIDEO_MOTION_STRENGTHS,
  VIDEO_STYLES,
  VIDEO_MODES,
  VIDEO_CAMERA_MOTIONS,
  VIDEO_SUBJECT_MOTIONS,
  type VideoCameraMotion,
  type VideoDurationSeconds,
  type VideoMode,
  type VideoMotionPreset,
  type VideoMotionStrength,
  type VideoStyle,
  type VideoSubjectMotion,
} from "@/lib/video/promptBuilder";
import { buildMegaskaFidelityPrompt } from "@/lib/video/fidelityPrompt";
import { runVideoJob } from "@/lib/video/runVideoJob";

export const runtime = "nodejs";
export const maxDuration = 300;

type VideoGeneratePayload = {
  ai_backend_id?: string | null;
  master_image_url?: string;
  source_generation_id?: string | null;
  motion_preset?: VideoMotionPreset;
  duration_seconds?: VideoDurationSeconds;
  style?: VideoStyle;
  motion_strength?: VideoMotionStrength;
  strict_garment_lock?: boolean;
  strict_anchor?: boolean;
  video_mode?: VideoMode;
  camera_motion?: VideoCameraMotion;
  subject_motion?: VideoSubjectMotion;
  aspect_ratio?: StudioAspectRatio;
  creative_notes?: string;
  requested_thumbnail_url?: string | null;
};

const VIDEO_PROJECT_ASPECT_RATIOS = ["16:9", "9:16"] as const;
type VideoProjectAspectRatio = (typeof VIDEO_PROJECT_ASPECT_RATIOS)[number];

function asJson(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function sanitizeForPath(input: string) {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 48) || "asset"
  );
}

function classifyStoredVideoUri(value: string) {
  if (value.startsWith("gs://")) return "gcs-gs-uri";
  if (value.startsWith("http://") || value.startsWith("https://")) {
    if (value.includes("/storage/v1/object/public/")) return "supabase-public-http";
    if (value.includes("/storage/v1/object/sign/")) return "supabase-signed-http";
    if (value.includes("/storage.googleapis.com/")) return "gcs-http";
    return "http-unknown";
  }
  if (value.startsWith("projects/") || value.startsWith("locations/")) return "provider-internal-uri";
  return "unknown-uri";
}

function isMotionPreset(value: unknown): value is VideoMotionPreset {
  return typeof value === "string" && VIDEO_MOTION_PRESETS.includes(value as VideoMotionPreset);
}

function isStyle(value: unknown): value is VideoStyle {
  return typeof value === "string" && VIDEO_STYLES.includes(value as VideoStyle);
}

function isMotionStrength(value: unknown): value is VideoMotionStrength {
  return typeof value === "string" && VIDEO_MOTION_STRENGTHS.includes(value as VideoMotionStrength);
}

function isDuration(value: unknown): value is VideoDurationSeconds {
  return typeof value === "number" && VIDEO_DURATIONS.includes(value as VideoDurationSeconds);
}


function isVideoMode(value: unknown): value is VideoMode {
  return typeof value === "string" && VIDEO_MODES.includes(value as VideoMode);
}

function isCameraMotion(value: unknown): value is VideoCameraMotion {
  return typeof value === "string" && VIDEO_CAMERA_MOTIONS.includes(value as VideoCameraMotion);
}

function isSubjectMotion(value: unknown): value is VideoSubjectMotion {
  return typeof value === "string" && VIDEO_SUBJECT_MOTIONS.includes(value as VideoSubjectMotion);
}

function isVideoProjectAspectRatio(value: string): value is VideoProjectAspectRatio {
  return VIDEO_PROJECT_ASPECT_RATIOS.includes(value as VideoProjectAspectRatio);
}

type UriClassification = ReturnType<typeof classifyStoredVideoUri>;

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    const googleApiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
    const supabaseBucket = process.env.SUPABASE_STORAGE_BUCKET ?? "brand-assets";

    if (!googleApiKey) {
      return asJson(500, { success: false, error: "Missing GOOGLE_API_KEY or GEMINI_API_KEY." });
    }

    let payload: VideoGeneratePayload;

    try {
      payload = (await request.json()) as VideoGeneratePayload;
    } catch {
      return asJson(400, { success: false, error: "Invalid JSON body." });
    }

    const masterImageUrl = payload.master_image_url?.trim();
    if (!masterImageUrl) {
      return asJson(400, { success: false, error: "master_image_url is required." });
    }

    if (!isMotionPreset(payload.motion_preset)) {
      return asJson(400, { success: false, error: "Unsupported motion_preset." });
    }

    if (!isDuration(payload.duration_seconds)) {
      return asJson(400, { success: false, error: "Unsupported duration_seconds." });
    }

    if (!isStyle(payload.style)) {
      return asJson(400, { success: false, error: "Unsupported style." });
    }

    if (!isMotionStrength(payload.motion_strength)) {
      return asJson(400, { success: false, error: "Unsupported motion_strength." });
    }

    const strictGarmentLock = payload.strict_garment_lock ?? true;
    const strictAnchor = payload.strict_anchor ?? true;
    const videoMode = payload.video_mode ?? "animate-master-shot";
    const cameraMotion = payload.camera_motion ?? "push";
    const subjectMotion = payload.subject_motion ?? "subtle";
    const aspectRatio = payload.aspect_ratio ?? "9:16";

    if (!isVideoMode(videoMode)) {
      return asJson(400, { success: false, error: "Unsupported video_mode." });
    }

    if (!isCameraMotion(cameraMotion)) {
      return asJson(400, { success: false, error: "Unsupported camera_motion." });
    }

    if (!isSubjectMotion(subjectMotion)) {
      return asJson(400, { success: false, error: "Unsupported subject_motion." });
    }

    if (!isStudioAspectRatio(aspectRatio)) {
      return asJson(400, { success: false, error: "Unsupported aspect_ratio value." });
    }

    if (!isVideoProjectAspectRatio(aspectRatio)) {
      return asJson(400, {
        success: false,
        error: "Video Project currently supports only 16:9 and 9:16 aspect ratios.",
      });
    }

    const strictMegaskaFidelity = strictAnchor && strictGarmentLock;
    const motionPresetCategory = getMotionPresetCategory(payload.motion_preset);
    const effectiveVideoMode = strictMegaskaFidelity ? "animate-master-shot" : videoMode;
    const effectiveMotionPreset =
      strictMegaskaFidelity && motionPresetCategory === "experimental" ? "subtle-breathing" : payload.motion_preset;
    const effectiveMotionPresetCategory = getMotionPresetCategory(effectiveMotionPreset);
    const effectiveSubjectMotion = strictMegaskaFidelity && subjectMotion === "moderate" ? "subtle" : subjectMotion;

    const prompt = buildMegaskaFidelityPrompt({
      videoMode: effectiveVideoMode,
      motionPreset: effectiveMotionPreset,
      durationSeconds: payload.duration_seconds,
      cameraMotion,
      subjectMotion: effectiveSubjectMotion,
      strictMegaskaFidelity,
      userPrompt: payload.creative_notes,
    });

    const videoResult = await runVideoJob({
      apiKey: googleApiKey,
      backendId: payload.ai_backend_id,
      prompt,
      durationSeconds: payload.duration_seconds,
      referenceImageUrls: [masterImageUrl],
      aspectRatio,
    });

    const rawOutputUri = videoResult.rawOutputUri?.trim() || null;
    const rawOutputUriFormat: UriClassification = rawOutputUri
      ? classifyStoredVideoUri(rawOutputUri)
      : "unknown-uri";
    const thumbnailUrl = payload.requested_thumbnail_url ?? masterImageUrl;

    console.log("[studio/video] provider output extracted", {
      backendId: videoResult.backendId,
      backendModel: videoResult.backendModel,
      mimeType: videoResult.mimeType,
      outputVideoUri: rawOutputUri,
      outputVideoUriFormat: rawOutputUriFormat,
      outputThumbnailUri: thumbnailUrl,
    });

    const fileName = `${Date.now()}-${sanitizeForPath(effectiveMotionPreset)}-${payload.duration_seconds}s.mp4`;
    const filePath = `video/${fileName}`;

    const supabase = getSupabaseAdminClient();

    const { error: uploadError } = await supabase.storage
      .from(supabaseBucket)
      .upload(filePath, videoResult.bytes, {
        contentType: videoResult.mimeType || "video/mp4",
        upsert: false,
      });

    if (uploadError) {
      console.error("[studio/video] canonical storage upload failed", {
        bucket: supabaseBucket,
        filePath,
        error: uploadError.message,
      });
      return asJson(500, { success: false, error: `Supabase upload failed: ${uploadError.message}` });
    }

    const { data: publicData } = supabase.storage.from(supabaseBucket).getPublicUrl(filePath);
    const canonicalVideoUrl = publicData.publicUrl;

    console.log("[studio/video] canonical storage upload succeeded", {
      bucket: supabaseBucket,
      filePath,
      canonicalVideoUrl,
      copyUploadSucceeded: true,
    });

    const debugMeta = {
      source: "video-project-phase-1",
      prompt,
      motionStrength: payload.motion_strength,
      motionPresetCategory: effectiveMotionPresetCategory,
      strictMegaskaFidelity,
      strictAnchor,
      videoMode: effectiveVideoMode,
      cameraMotion,
      subjectMotion: effectiveSubjectMotion,
      creativeNotes: payload.creative_notes ?? null,
      masterImageUrl,
      backendModel: videoResult.backendModel,
      rawOutputUri,
      rawOutputUriFormat,
      generatedAt: new Date().toISOString(),
    };

    const generationInsertPayload = {
      prompt,
      type: "Video",
      media_type: "Video",
      status: "completed",
      aspect_ratio: aspectRatio,
      asset_url: canonicalVideoUrl,
      url: canonicalVideoUrl,
      overlay_json: {
        ai_backend_id: videoResult.backendId,
        ai_model: videoResult.backendModel,
        backendModel: videoResult.backendModel,
      },
      reference_urls: [masterImageUrl],
      generation_kind: "video",
      source_generation_id: payload.source_generation_id ?? null,
      thumbnail_url: thumbnailUrl,
      video_meta: {
        motionPreset: effectiveMotionPreset,
        durationSeconds: payload.duration_seconds,
        style: payload.style,
        motionStrength: payload.motion_strength,
        motionPresetCategory: effectiveMotionPresetCategory,
        strictGarmentLock,
        strictMegaskaFidelity,
        strictAnchor,
        videoMode: effectiveVideoMode,
        cameraMotion,
        subjectMotion: effectiveSubjectMotion,
        storage: {
          provider: "supabase",
          bucket: supabaseBucket,
          objectPath: filePath,
          publicUrl: canonicalVideoUrl,
          copySucceeded: true,
        },
        sourceOutput: {
          provider: rawOutputUriFormat,
          uri: rawOutputUri,
        },
        providerResponse: videoResult.providerResponseMeta,
        sourceMasterGenerationId: payload.source_generation_id ?? null,
        sourceMasterImageUrl: masterImageUrl,
        debug: debugMeta,
      },
    } satisfies Record<string, unknown>;

    console.log("[studio/video] generations insert payload", {
      type: generationInsertPayload.type,
      mediaType: generationInsertPayload.media_type,
      status: generationInsertPayload.status,
      generationKind: generationInsertPayload.generation_kind,
      canonicalUrl: generationInsertPayload.url,
      canonicalAssetUrl: generationInsertPayload.asset_url,
      thumbnailUrl: generationInsertPayload.thumbnail_url,
      sourceGenerationId: generationInsertPayload.source_generation_id,
      hasVideoMeta: true,
    });

    const { data: inserted, error: insertError } = await supabase
      .from("generations")
      .insert(generationInsertPayload)
      .select("id,url,asset_url,type,media_type,status")
      .single();

    if (insertError) {
      console.error("[studio/video] generations insert failed", {
        error: insertError.message,
        type: generationInsertPayload.type,
        mediaType: generationInsertPayload.media_type,
        generationKind: generationInsertPayload.generation_kind,
        canonicalUrl: generationInsertPayload.url,
        canonicalAssetUrl: generationInsertPayload.asset_url,
      });
      return asJson(500, { success: false, error: `Generation insert failed: ${insertError.message}` });
    }

    console.log("[studio/video] generations insert succeeded", {
      generationId: inserted.id,
      type: inserted.type,
      mediaType: inserted.media_type,
      status: inserted.status,
      canonicalUrl: inserted.url,
      canonicalAssetUrl: inserted.asset_url,
    });

    console.log("[studio/video] success", {
      generationId: inserted.id,
      backendId: videoResult.backendId,
      outputUriFormat: classifyStoredVideoUri(canonicalVideoUrl),
      rawOutputUriFormat,
      rawOutputUri,
      outputUrl: canonicalVideoUrl,
      canonicalStorageProvider: "supabase",
      canonicalBucket: supabaseBucket,
      storagePath: filePath,
      appOwnedCopyUploadSucceeded: true,
      elapsedMs: Date.now() - startedAt,
    });

    return asJson(200, {
      success: true,
      generationId: inserted.id,
      outputUrl: canonicalVideoUrl,
      downloadUrl: `/api/studio/video/${inserted.id}/download`,
      thumbnailUrl,
      backend: videoResult.backendId,
      backendModel: videoResult.backendModel,
      prompt,
      sourceGenerationId: payload.source_generation_id ?? null,
      videoMeta: {
        motionPreset: effectiveMotionPreset,
        durationSeconds: payload.duration_seconds,
        style: payload.style,
        motionStrength: payload.motion_strength,
        motionPresetCategory: effectiveMotionPresetCategory,
        strictGarmentLock,
        strictMegaskaFidelity,
        strictAnchor,
        videoMode: effectiveVideoMode,
        cameraMotion,
        subjectMotion: effectiveSubjectMotion,
      },
    });
  } catch (error) {
    console.error("[studio/video] unhandled error", error);

    if (error instanceof ProviderInvalidArgumentError) {
      return asJson(400, {
        success: false,
        error: error.message,
      });
    }

    if (error instanceof ProviderUnavailableError) {
      return asJson(503, {
        success: false,
        error_code: error.errorCode,
        error: "AI video service is busy right now. Please retry.",
      });
    }

    if (isGeminiUnavailableError(error)) {
      return asJson(503, {
        success: false,
        error: "AI video service is busy right now. Please retry.",
      });
    }

    return asJson(500, {
      success: false,
      error: error instanceof Error ? error.message : "Unexpected server error.",
    });
  }
}