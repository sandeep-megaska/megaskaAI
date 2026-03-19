import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  ProviderInvalidArgumentError,
  ProviderModelNotFoundError,
  ProviderUnavailableError,
  isGeminiUnavailableError,
} from "@/lib/ai/providerErrors";
import { isStudioAspectRatio, type StudioAspectRatio } from "@/lib/studio/aspectRatios";
import {
  classifyMotionRiskFromActionPrompt,
  getMotionPresetCategory,
  VIDEO_DURATIONS,
  VIDEO_FIDELITY_PRIORITIES,
  VIDEO_INPUT_MODES,
  VIDEO_MODES,
  VIDEO_MOTION_PRESETS,
  VIDEO_MOTION_STRENGTHS,
  VIDEO_STYLES,
  VIDEO_CAMERA_MOTIONS,
  VIDEO_SUBJECT_MOTIONS,
  VIDEO_STRICT_SAFE_MOTION_PRESETS,
  type MotionRiskLevel,
  type VideoCameraMotion,
  type VideoDurationSeconds,
  type VideoFidelityPriority,
  type VideoInputMode,
  type VideoMode,
  type VideoMotionPreset,
  type VideoMotionStrength,
  type VideoStyle,
  type VideoSubjectMotion,
} from "@/lib/video/promptBuilder";
import { buildInvariantPromptBlock, buildMegaskaFidelityPrompt } from "@/lib/video/fidelityPrompt";
import { runVideoJob } from "@/lib/video/runVideoJob";
import { VideoGenerationOutputError } from "@/lib/ai/adapters/veoVideoAdapter";
import { getVideoCapabilityByBackendId } from "@/lib/video/providerCapabilities";
import { runVideoEvaluation } from "@/lib/video/evaluator/runVideoEvaluation";

export const runtime = "nodejs";
export const maxDuration = 300;

type VideoAnchorRef = {
  url?: string;
  generationId?: string | null;
  generation_id?: string | null;
};

type VideoReferenceImage = {
  url?: string;
  generationId?: string | null;
  generation_id?: string | null;
  tag?: string | null;
};

type VideoGeneratePayload = {
  ai_backend_id?: string | null;
  master_image_url?: string;
  source_generation_id?: string | null;
  start_frame_url?: string;
  start_frame_generation_id?: string | null;
  end_frame_url?: string;
  end_frame_generation_id?: string | null;
  reference_frames?: VideoAnchorRef[];
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

  // v2 fields
  input_mode?: VideoInputMode;
  reference_images?: VideoReferenceImage[];
  action_prompt?: string;
  style_hint?: string;
  fidelity_priority?: VideoFidelityPriority;
  video_goal?: string;
};

const VIDEO_PROJECT_ASPECT_RATIOS = ["16:9", "9:16"] as const;
const FRAME_MODE_REFERENCE_LIMIT = 3;
const MULTI_REFERENCE_MAX = 6;
const VIDEO_STRICT_SAFE_MOTION_PRESETS_SET: ReadonlySet<VideoMotionPreset> = new Set(VIDEO_STRICT_SAFE_MOTION_PRESETS);
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

function isInputMode(value: unknown): value is VideoInputMode {
  return typeof value === "string" && VIDEO_INPUT_MODES.includes(value as VideoInputMode);
}

function isFidelityPriority(value: unknown): value is VideoFidelityPriority {
  return typeof value === "string" && VIDEO_FIDELITY_PRIORITIES.includes(value as VideoFidelityPriority);
}

function cleanUrl(value?: string | null) {
  return value?.trim() || null;
}

function normalizeUrlForComparison(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return trimmed.split(/[?#]/, 1)[0] ?? trimmed;
  }
}

function isMeaningfullyDifferentUrl(left?: string | null, right?: string | null) {
  const leftNormalized = normalizeUrlForComparison(left);
  const rightNormalized = normalizeUrlForComparison(right);
  if (!leftNormalized || !rightNormalized) return true;
  return leftNormalized !== rightNormalized;
}

function normalizeAnchorRef(anchor?: VideoAnchorRef | null, fallbackUrl?: string | null, fallbackGenerationId?: string | null) {
  return {
    url: cleanUrl(anchor?.url) ?? cleanUrl(fallbackUrl),
    generationId: anchor?.generationId?.trim() || anchor?.generation_id?.trim() || fallbackGenerationId?.trim() || null,
  };
}

function pushCompatibilityWarning(warnings: string[], warning: string) {
  if (!warnings.includes(warning)) warnings.push(warning);
}

function dedupeReferenceUrls(urls: string[]) {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const url of urls) {
    const normalized = normalizeUrlForComparison(url) ?? url;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(url);
  }
  return deduped;
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

    if (!isMotionPreset(payload.motion_preset) || !isDuration(payload.duration_seconds) || !isStyle(payload.style) || !isMotionStrength(payload.motion_strength)) {
      return asJson(400, { success: false, error: "Unsupported motion or style settings." });
    }

    const strictGarmentLock = payload.strict_garment_lock ?? true;
    const strictAnchor = payload.strict_anchor ?? true;
    const videoMode = payload.video_mode ?? "animated-still-strict";
    const cameraMotion = payload.camera_motion ?? "push";
    const subjectMotion = payload.subject_motion ?? "subtle";
    const aspectRatio = payload.aspect_ratio ?? "9:16";
    const inputMode = isInputMode(payload.input_mode) ? payload.input_mode : "anchor-based";
    const fidelityPriority = isFidelityPriority(payload.fidelity_priority) ? payload.fidelity_priority : "balanced";

    if (!isVideoMode(videoMode) || !isCameraMotion(cameraMotion) || !isSubjectMotion(subjectMotion)) {
      return asJson(400, { success: false, error: "Unsupported mode settings." });
    }

    if (!isStudioAspectRatio(aspectRatio) || !isVideoProjectAspectRatio(aspectRatio)) {
      return asJson(400, { success: false, error: "Video Project currently supports only 16:9 and 9:16 aspect ratios." });
    }

    const compatibilityWarnings: string[] = [];

    const fitAnchor = normalizeAnchorRef(payload.fit_anchor, payload.master_image_url, payload.source_generation_id ?? null);
    const identityAnchor = normalizeAnchorRef(payload.identity_anchor);
    const garmentAnchor = normalizeAnchorRef(payload.garment_anchor);
    const firstFrame = normalizeAnchorRef(payload.first_frame, payload.start_frame_url, payload.start_frame_generation_id ?? null);
    const lastFrame = normalizeAnchorRef(payload.last_frame, payload.end_frame_url, payload.end_frame_generation_id ?? null);

    const legacyReferenceFrames = (payload.reference_frames ?? [])
      .map((ref) => normalizeAnchorRef(ref))
      .filter((ref): ref is { url: string; generationId: string | null } => Boolean(ref.url));

    const multiReferenceImages = (payload.reference_images ?? [])
      .map((ref) => normalizeAnchorRef(ref))
      .filter((ref): ref is { url: string; generationId: string | null } => Boolean(ref.url));

    if (multiReferenceImages.length > MULTI_REFERENCE_MAX) {
      pushCompatibilityWarning(compatibilityWarnings, `Maximum ${MULTI_REFERENCE_MAX} reference images are supported; extras were ignored.`);
    }

    const boundedMultiReferenceUrls = dedupeReferenceUrls(multiReferenceImages.map((item) => item.url)).slice(0, MULTI_REFERENCE_MAX);

    if (inputMode === "multi-reference" && boundedMultiReferenceUrls.length < 4) {
      return asJson(400, { success: false, error: "Multi-reference mode requires at least 4 reference images." });
    }

    const actionPrompt = payload.action_prompt?.trim() || payload.creative_notes?.trim() || "subtle natural movement";
    let motionRiskLevel: MotionRiskLevel = classifyMotionRiskFromActionPrompt(actionPrompt);

    if (fidelityPriority === "maximum-fidelity" && motionRiskLevel === "high") {
      pushCompatibilityWarning(compatibilityWarnings, "High-risk motion requested under maximum fidelity; motion intent may be softened.");
    }

    let effectiveMotionPreset = payload.motion_preset;
    let effectiveSubjectMotion = subjectMotion;

    if (fidelityPriority === "maximum-fidelity") {
      if (!VIDEO_STRICT_SAFE_MOTION_PRESETS_SET.has(effectiveMotionPreset)) {
        effectiveMotionPreset = "subtle-breathing";
        pushCompatibilityWarning(compatibilityWarnings, "Motion preset adjusted to subtle-breathing for maximum fidelity.");
      }
      if (effectiveSubjectMotion === "moderate") {
        effectiveSubjectMotion = "subtle";
      }
      if (motionRiskLevel === "high") motionRiskLevel = "medium";
    }

    if (videoMode === "anchored-short-shot" && (!firstFrame.url || !lastFrame.url)) {
      return asJson(400, { success: false, error: "anchored-short-shot mode requires first_frame.url and last_frame.url." });
    }

    if (videoMode === "animated-still-strict" && !fitAnchor.url && inputMode === "anchor-based") {
      return asJson(400, { success: false, error: "animated-still-strict mode requires fit_anchor.url in anchor-based mode." });
    }

    const prompt = buildMegaskaFidelityPrompt({
      durationSeconds: payload.duration_seconds,
      fidelityPriority,
      motionRiskLevel,
      actionPrompt,
      styleHint: payload.style_hint,
    });

    let firstFrameUrl: string | null = null;
    let lastFrameUrl: string | null = null;
    let referenceImageUrls: string[] = [];

    if (inputMode === "multi-reference") {
      firstFrameUrl = fitAnchor.url ?? boundedMultiReferenceUrls[0] ?? null;
      lastFrameUrl = null;

      const prioritized = [
        boundedMultiReferenceUrls.find((url) => !isMeaningfullyDifferentUrl(url, identityAnchor.url)),
        boundedMultiReferenceUrls.find((url) => !isMeaningfullyDifferentUrl(url, garmentAnchor.url)),
        boundedMultiReferenceUrls.find((url) => isMeaningfullyDifferentUrl(url, identityAnchor.url) && isMeaningfullyDifferentUrl(url, garmentAnchor.url)),
      ].filter((value): value is string => Boolean(value));

      referenceImageUrls = dedupeReferenceUrls([...prioritized, ...boundedMultiReferenceUrls]).slice(0, FRAME_MODE_REFERENCE_LIMIT);

      if (motionRiskLevel === "high") {
        pushCompatibilityWarning(compatibilityWarnings, "High motion + multi-reference: sent best 3 references to stay within provider limits.");
      }
    } else if (videoMode === "anchored-short-shot") {
      firstFrameUrl = firstFrame.url;
      lastFrameUrl = lastFrame.url;
      referenceImageUrls = dedupeReferenceUrls(
        [identityAnchor.url, garmentAnchor.url, fitAnchor.url].filter((value): value is string => Boolean(value)),
      ).slice(0, FRAME_MODE_REFERENCE_LIMIT);
    } else {
      firstFrameUrl = fitAnchor.url ?? firstFrame.url;
      lastFrameUrl = lastFrame.url;
      referenceImageUrls = dedupeReferenceUrls([
        identityAnchor.url,
        garmentAnchor.url,
        ...legacyReferenceFrames.map((ref) => ref.url),
      ].filter((value): value is string => Boolean(value))).slice(0, FRAME_MODE_REFERENCE_LIMIT);
    }

    if (!firstFrameUrl && !referenceImageUrls.length) {
      return asJson(400, { success: false, error: "At least one anchor or reference image is required." });
    }

    const attachedReferenceRoles = [
      fitAnchor.url ? "fitAnchor" : null,
      identityAnchor.url ? "identityAnchor" : null,
      garmentAnchor.url ? "garmentAnchor" : null,
      firstFrame.url ? "firstFrame" : null,
      lastFrame.url ? "lastFrame" : null,
    ].filter((value): value is string => Boolean(value));

    const selectedCapability = getVideoCapabilityByBackendId(payload.ai_backend_id ?? null);
    if (selectedCapability?.warning) {
      pushCompatibilityWarning(compatibilityWarnings, selectedCapability.warning);
    }

    let videoResult;
    try {
      videoResult = await runVideoJob({
        apiKey: googleApiKey,
        backendId: payload.ai_backend_id,
        prompt,
        durationSeconds: payload.duration_seconds,
        firstFrameUrl,
        lastFrameUrl,
        referenceImageUrls,
        identityAnchorUrl: identityAnchor.url,
        garmentAnchorUrl: garmentAnchor.url,
        fitAnchorUrl: fitAnchor.url,
        inputMode,
        requestedFidelityPriority: fidelityPriority,
        aspectRatio,
      });
    } catch (videoError) {
      console.error("[studio/video] generation failed", {
        error: videoError,
        diagnostics: {
          inputMode,
          fidelityPriority,
          motionRiskLevel,
          attachedReferenceCount: referenceImageUrls.length,
          attachedReferenceRoles,
        },
      });
      throw videoError;
    }

    const rawOutputUri = videoResult.rawOutputUri?.trim() || null;
    const rawOutputUriFormat: UriClassification = rawOutputUri ? classifyStoredVideoUri(rawOutputUri) : "unknown-uri";
    const thumbnailUrl = payload.requested_thumbnail_url ?? firstFrameUrl ?? fitAnchor.url ?? boundedMultiReferenceUrls[0] ?? null;

    const fileName = `${Date.now()}-${sanitizeForPath(effectiveMotionPreset)}-${payload.duration_seconds}s.mp4`;
    const filePath = `video/${fileName}`;

    const supabase = getSupabaseAdminClient();
    const { error: uploadError } = await supabase.storage.from(supabaseBucket).upload(filePath, videoResult.bytes, {
      contentType: videoResult.mimeType || "video/mp4",
      upsert: false,
    });

    if (uploadError) return asJson(500, { success: false, error: `Supabase upload failed: ${uploadError.message}` });

    const { data: publicData } = supabase.storage.from(supabaseBucket).getPublicUrl(filePath);
    const canonicalVideoUrl = publicData.publicUrl;

    const sourceReferenceUrls = [firstFrameUrl, lastFrameUrl, ...referenceImageUrls].filter((value): value is string => Boolean(value));
    const evaluation = await runVideoEvaluation({
      videoBytes: videoResult.bytes,
      anchors: {
        identityAnchorUrl: identityAnchor.url,
        garmentAnchorUrl: garmentAnchor.url,
        fitAnchorUrl: fitAnchor.url,
        firstFrameUrl,
        selectedReferenceSubset: videoResult.diagnostics.selectedReferenceSubset,
        referenceUrls: sourceReferenceUrls,
      },
    });

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
        strictAnchor,
        videoMode,
        cameraMotion,
        subjectMotion: effectiveSubjectMotion,
        sourceOutput: { provider: rawOutputUriFormat, uri: rawOutputUri },
        provider: videoResult.provider,
        selectedBackendId: videoResult.backendId,
        selectedBackendLabel: videoResult.backendLabel,
        requestedProviderModelId: videoResult.providerModelId,
        promptVersion: "video-prompt-v3",
        motionRiskLevel,
        compatibilityWarnings,

        inputMode,
        referenceImageCount: boundedMultiReferenceUrls.length,
        anchorRolesUsed: attachedReferenceRoles,
        fidelityPriority,
        actionPrompt: actionPrompt,
        invariantPromptVersion: "invariants-v1",
        selectedReferenceSubset: videoResult.diagnostics.selectedReferenceSubset,
        droppedAnchors: videoResult.diagnostics.droppedAnchors,
        attemptDiagnostics: videoResult.diagnostics.attempts,
        successAttemptNumber: videoResult.diagnostics.successAttemptNumber,
        successVariantLabel: videoResult.diagnostics.successVariantLabel,
        successComplexityTier: videoResult.diagnostics.successComplexityTier,
        successUsedCompatibilityFallback: videoResult.diagnostics.successUsedCompatibilityFallback,
        usedCompatibilityFallback: videoResult.diagnostics.successUsedCompatibilityFallback,
        requestedMotionLevel: videoResult.diagnostics.requestedMotionLevel,
        actualMotionUsed: videoResult.diagnostics.actualMotionUsed,
        invariantPromptBlock: buildInvariantPromptBlock(),
        requestedReferenceCount: boundedMultiReferenceUrls.length,
        evaluator: evaluation,
        evaluationStatus: evaluation.evaluationStatus,
        manualReviewStatus: "pending",
        manualReviewUpdatedAt: null,
        manualReviewUpdatedBy: null,

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
        providerResponse: videoResult.providerResponseMeta,
      },
    } satisfies Record<string, unknown>;

    const { data: inserted, error: insertError } = await supabase
      .from("generations")
      .insert(generationInsertPayload)
      .select("id,url,asset_url,type,media_type,status")
      .single();

    if (insertError) return asJson(500, { success: false, error: `Generation insert failed: ${insertError.message}` });

    return asJson(200, {
      success: true,
      generationId: inserted.id,
      outputUrl: canonicalVideoUrl,
      downloadUrl: `/api/studio/video/${inserted.id}/download`,
      thumbnailUrl,
      backend: videoResult.backendId,
      backendLabel: videoResult.backendLabel,
      backendModel: videoResult.backendModel,
      provider: videoResult.provider,
      providerModelId: videoResult.providerModelId,
      prompt,
      sourceGenerationId: payload.source_generation_id ?? null,
      videoMeta: {
        motionPreset: effectiveMotionPreset,
        durationSeconds: payload.duration_seconds,
        style: payload.style,
        motionStrength: payload.motion_strength,
        motionPresetCategory: getMotionPresetCategory(effectiveMotionPreset),
        strictGarmentLock,
        strictAnchor,
        videoMode,
        cameraMotion,
        subjectMotion: effectiveSubjectMotion,
        motionRiskLevel,
        compatibilityWarnings,
        inputMode,
        referenceImageCount: boundedMultiReferenceUrls.length,
        anchorRolesUsed: attachedReferenceRoles,
        fidelityPriority,
        actionPrompt,
        invariantPromptVersion: "invariants-v1",
        selectedReferenceSubset: videoResult.diagnostics.selectedReferenceSubset,
        droppedAnchors: videoResult.diagnostics.droppedAnchors,
        attemptDiagnostics: videoResult.diagnostics.attempts,
        successAttemptNumber: videoResult.diagnostics.successAttemptNumber,
        successVariantLabel: videoResult.diagnostics.successVariantLabel,
        successComplexityTier: videoResult.diagnostics.successComplexityTier,
        successUsedCompatibilityFallback: videoResult.diagnostics.successUsedCompatibilityFallback,
        usedCompatibilityFallback: videoResult.diagnostics.successUsedCompatibilityFallback,
        requestedMotionLevel: videoResult.diagnostics.requestedMotionLevel,
        actualMotionUsed: videoResult.diagnostics.actualMotionUsed,
        evaluator: evaluation,
        evaluationStatus: evaluation.evaluationStatus,
        manualReviewStatus: "pending",
      },
    });
  } catch (error) {
    if (error instanceof ProviderModelNotFoundError) {
      return asJson(404, {
        success: false,
        error_code: "model-not-found",
        error: "This model ID is not available on the current Gemini API path.",
      });
    }

    if (error instanceof ProviderInvalidArgumentError) {
      return asJson(400, {
        success: false,
        error_code: "rejected-params",
        error: "This provider rejected all compatible request variants for the current settings. Try fewer anchors, safer motion, or the Megaska Fidelity Baseline mode.",
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
