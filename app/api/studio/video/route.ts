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
  getMotionRiskLevel,
  VIDEO_ANCHORED_SAFE_MOTION_PRESETS,
  VIDEO_DURATIONS,
  VIDEO_MODES,
  VIDEO_MOTION_PRESETS,
  VIDEO_MOTION_STRENGTHS,
  VIDEO_STRICT_SAFE_MOTION_PRESETS,
  VIDEO_STYLES,
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

type VideoAnchorRef = {
  url?: string;
  generationId?: string | null;
  generation_id?: string | null;
};

type VideoGeneratePayload = {
  ai_backend_id?: string | null;
  // legacy fields
  master_image_url?: string;
  source_generation_id?: string | null;
  start_frame_url?: string;
  start_frame_generation_id?: string | null;
  end_frame_url?: string;
  end_frame_generation_id?: string | null;
  reference_frames?: VideoAnchorRef[];
  // subject package fields
  identity_anchor?: VideoAnchorRef;
  garment_anchor?: VideoAnchorRef;
  fit_anchor?: VideoAnchorRef;
  first_frame?: VideoAnchorRef;
  last_frame?: VideoAnchorRef;
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
const FRAME_MODE_REFERENCE_LIMIT = 3;

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

function isAllowedMotionPreset<TPreset extends VideoMotionPreset>(
  preset: VideoMotionPreset,
  allowed: readonly TPreset[],
): preset is TPreset {
  return allowed.includes(preset as TPreset);
}

function cleanUrl(value?: string | null) {
  return value?.trim() || null;
}

function normalizeAnchorRef(anchor?: VideoAnchorRef | null, fallbackUrl?: string | null, fallbackGenerationId?: string | null) {
  return {
    url: cleanUrl(anchor?.url) ?? cleanUrl(fallbackUrl),
    generationId: anchor?.generationId?.trim() || anchor?.generation_id?.trim() || fallbackGenerationId?.trim() || null,
  };
}

function pushCompatibilityWarning(warnings: string[], warning: string) {
  if (!warnings.includes(warning)) {
    warnings.push(warning);
  }
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
    const videoMode = payload.video_mode ?? "animated-still-strict";
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

    const strictMegaskaFidelity = strictAnchor && strictGarmentLock && videoMode !== "creative-reinterpretation";
    const compatibilityWarnings: string[] = [];

    const fitAnchor = normalizeAnchorRef(payload.fit_anchor, payload.master_image_url, payload.source_generation_id ?? null);
    const identityAnchor = normalizeAnchorRef(payload.identity_anchor);
    const garmentAnchor = normalizeAnchorRef(payload.garment_anchor);
    const firstFrame = normalizeAnchorRef(payload.first_frame, payload.start_frame_url, payload.start_frame_generation_id ?? null);
    const lastFrame = normalizeAnchorRef(payload.last_frame, payload.end_frame_url, payload.end_frame_generation_id ?? null);

    const legacyReferenceFrames = (payload.reference_frames ?? [])
      .map((ref) => normalizeAnchorRef(ref))
      .filter((ref): ref is { url: string; generationId: string | null } => Boolean(ref.url));

    const effectiveMotionPreset = payload.motion_preset;
    let effectiveSubjectMotion = subjectMotion;

    if (videoMode === "animated-still-strict") {
      if (!fitAnchor.url) {
        return asJson(400, { success: false, error: "animated-still-strict mode requires fit_anchor.url." });
      }

      if (!isAllowedMotionPreset(effectiveMotionPreset, VIDEO_STRICT_SAFE_MOTION_PRESETS)) {
        return asJson(400, {
          success: false,
          error: `Motion preset '${effectiveMotionPreset}' is not allowed in animated-still-strict mode.`,
        });
      }

      if (effectiveSubjectMotion !== "none" && effectiveSubjectMotion !== "subtle") {
        return asJson(400, {
          success: false,
          error: "animated-still-strict mode allows only none/subtle subject_motion.",
        });
      }

      if (cameraMotion === "pan" && effectiveMotionPreset !== "gentle-pan") {
        pushCompatibilityWarning(compatibilityWarnings, "Gentle pan camera motion is best paired with gentle-pan preset.");
      }
    }

    if (videoMode === "anchored-short-shot") {
      if (!firstFrame.url || !lastFrame.url) {
        return asJson(400, { success: false, error: "anchored-short-shot mode requires first_frame.url and last_frame.url." });
      }

      if (!isAllowedMotionPreset(effectiveMotionPreset, VIDEO_ANCHORED_SAFE_MOTION_PRESETS)) {
        return asJson(400, {
          success: false,
          error: `Motion preset '${effectiveMotionPreset}' is not allowed in anchored-short-shot mode.`,
        });
      }

      if (effectiveSubjectMotion === "moderate") {
        effectiveSubjectMotion = "subtle";
        pushCompatibilityWarning(compatibilityWarnings, "Moderate subject motion was reduced to subtle for anchored-short-shot mode.");
      }

      if (firstFrame.url === lastFrame.url) {
        pushCompatibilityWarning(compatibilityWarnings, "First Frame and Last Frame are identical; motion may be minimal.");
      }
    }

    if (videoMode === "creative-reinterpretation") {
      const hasAnyAnchor = Boolean(
        fitAnchor.url || firstFrame.url || lastFrame.url || identityAnchor.url || garmentAnchor.url || legacyReferenceFrames.length,
      );
      if (!hasAnyAnchor) {
        return asJson(400, { success: false, error: "Provide at least one anchor image for creative-reinterpretation mode." });
      }
    }

    const prompt = buildMegaskaFidelityPrompt({
      videoMode,
      motionPreset: effectiveMotionPreset,
      durationSeconds: payload.duration_seconds,
      strictMegaskaFidelity,
      userPrompt: videoMode === "animated-still-strict" ? null : payload.creative_notes,
    });

    const rawReferenceCandidates = [
      identityAnchor.url,
      garmentAnchor.url,
      ...legacyReferenceFrames.map((ref) => ref.url),
    ].filter((value): value is string => Boolean(value));

    let firstFrameUrl: string | null = null;
    let lastFrameUrl: string | null = null;
    let referenceImageUrls: string[] = [];

    if (videoMode === "animated-still-strict") {
      firstFrameUrl = fitAnchor.url;
      lastFrameUrl = null;
      referenceImageUrls = Array.from(new Set([identityAnchor.url, garmentAnchor.url].filter((value): value is string => Boolean(value))));
    } else if (videoMode === "anchored-short-shot") {
      firstFrameUrl = firstFrame.url;
      lastFrameUrl = lastFrame.url;
      referenceImageUrls = Array.from(
        new Set([
          identityAnchor.url,
          garmentAnchor.url,
          fitAnchor.url && fitAnchor.url !== firstFrame.url ? fitAnchor.url : null,
        ].filter((value): value is string => Boolean(value))),
      );
    } else {
      firstFrameUrl = firstFrame.url ?? fitAnchor.url;
      lastFrameUrl = lastFrame.url;
      referenceImageUrls = Array.from(new Set(rawReferenceCandidates));
    }

    if (referenceImageUrls.length > FRAME_MODE_REFERENCE_LIMIT) {
      pushCompatibilityWarning(compatibilityWarnings, `Reference anchor count exceeds provider limit (${FRAME_MODE_REFERENCE_LIMIT}); extras were dropped.`);
      referenceImageUrls = referenceImageUrls.slice(0, FRAME_MODE_REFERENCE_LIMIT);
    }

    const attachedReferenceRoles = [
      identityAnchor.url ? "identityAnchor" : null,
      garmentAnchor.url ? "garmentAnchor" : null,
      videoMode === "anchored-short-shot" && fitAnchor.url && fitAnchor.url !== firstFrame.url ? "fitAnchor" : null,
    ].filter((value): value is string => Boolean(value));

    if (videoMode !== "creative-reinterpretation" && getMotionPresetCategory(effectiveMotionPreset) === "experimental") {
      pushCompatibilityWarning(compatibilityWarnings, "Experimental motion preset selected in a fidelity-oriented mode.");
    }

    if (videoMode === "anchored-short-shot") {
      pushCompatibilityWarning(compatibilityWarnings, "Best results come from anchors with same model, garment, and scene.");
      pushCompatibilityWarning(compatibilityWarnings, "Large pose changes increase drift risk.");
    }

    const videoResult = await runVideoJob({
      apiKey: googleApiKey,
      backendId: payload.ai_backend_id,
      prompt,
      durationSeconds: payload.duration_seconds,
      firstFrameUrl,
      lastFrameUrl,
      referenceImageUrls,
      aspectRatio,
    });

    const rawOutputUri = videoResult.rawOutputUri?.trim() || null;
    const rawOutputUriFormat: UriClassification = rawOutputUri
      ? classifyStoredVideoUri(rawOutputUri)
      : "unknown-uri";
    const thumbnailUrl =
      payload.requested_thumbnail_url ?? firstFrameUrl ?? fitAnchor.url ?? null;

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
      return asJson(500, { success: false, error: `Supabase upload failed: ${uploadError.message}` });
    }

    const { data: publicData } = supabase.storage.from(supabaseBucket).getPublicUrl(filePath);
    const canonicalVideoUrl = publicData.publicUrl;

    const sourceReferenceUrls = [firstFrameUrl, lastFrameUrl, ...referenceImageUrls].filter(
      (value): value is string => Boolean(value),
    );

    const motionRiskLevel = getMotionRiskLevel(videoMode, effectiveMotionPreset);

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
      reference_urls: sourceReferenceUrls,
      generation_kind: "video",
      source_generation_id: firstFrame.generationId ?? fitAnchor.generationId ?? payload.source_generation_id ?? null,
      thumbnail_url: thumbnailUrl,
      video_meta: {
        motionPreset: effectiveMotionPreset,
        durationSeconds: payload.duration_seconds,
        style: payload.style,
        motionStrength: payload.motion_strength,
        motionPresetCategory: getMotionPresetCategory(effectiveMotionPreset),
        strictGarmentLock,
        strictMegaskaFidelity,
        strictAnchor,
        videoMode,
        cameraMotion,
        subjectMotion: effectiveSubjectMotion,
        sourceOutput: {
          provider: rawOutputUriFormat,
          uri: rawOutputUri,
        },
        promptVersion: "video-prompt-v2",
        antiDriftEnabled: videoMode !== "creative-reinterpretation",
        motionRiskLevel,
        compatibilityWarnings,
        identityAnchorGenerationId: identityAnchor.generationId,
        identityAnchorUrl: identityAnchor.url,
        garmentAnchorGenerationId: garmentAnchor.generationId,
        garmentAnchorUrl: garmentAnchor.url,
        fitAnchorGenerationId: fitAnchor.generationId,
        fitAnchorUrl: fitAnchor.url,
        firstFrameGenerationId: firstFrame.generationId,
        firstFrameUrl,
        lastFrameGenerationId: lastFrame.generationId,
        lastFrameUrl,
        attachedReferenceRoles,
        attachedReferenceCount: referenceImageUrls.length,
        requestedReferenceCount: rawReferenceCandidates.length,
        providerResponse: videoResult.providerResponseMeta,
      },
    } satisfies Record<string, unknown>;

    const { data: inserted, error: insertError } = await supabase
      .from("generations")
      .insert(generationInsertPayload)
      .select("id,url,asset_url,type,media_type,status")
      .single();

    if (insertError) {
      return asJson(500, { success: false, error: `Generation insert failed: ${insertError.message}` });
    }

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
        motionPresetCategory: getMotionPresetCategory(effectiveMotionPreset),
        strictGarmentLock,
        strictMegaskaFidelity,
        strictAnchor,
        videoMode,
        cameraMotion,
        subjectMotion: effectiveSubjectMotion,
        motionRiskLevel,
        compatibilityWarnings,
        identityAnchorGenerationId: identityAnchor.generationId,
        garmentAnchorGenerationId: garmentAnchor.generationId,
        fitAnchorGenerationId: fitAnchor.generationId,
        firstFrameGenerationId: firstFrame.generationId,
        lastFrameGenerationId: lastFrame.generationId,
        attachedReferenceRoles,
      },
    });
  } catch (error) {
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
  } finally {
    console.log("[studio/video] completed", { elapsedMs: Date.now() - startedAt });
  }
}
