import { GoogleGenAI, VideoGenerationReferenceType, type VideoGenerationReferenceImage } from "@google/genai";
import { loadImageReference } from "@/lib/ai/loadImageReference";
import { ProviderModelNotFoundError, mapGeminiProviderError } from "@/lib/ai/providerErrors";
import { resolveVeoModelCandidates } from "@/lib/ai/veoModels";
import { type StudioAspectRatio } from "@/lib/studio/aspectRatios";
import type { ConditioningPlan } from "@/lib/video/veo/conditioning";
import {
  collectVeoAssetCandidates,
  extractFileNameFromVideoUri,
  getPollingConfig,
  resolveVideoBytes,
  summarizeOperation,
  type GeneratedVideoLike,
  type ResolveVideoBytesDiagnostics,
} from "@/lib/video/veo/download";

const SUPPORTED_ASPECT_RATIOS = ["16:9", "9:16"] as const;

export type VideoGenerationFailureCode =
  | "no-operation"
  | "operation-not-done"
  | "operation-error"
  | "response-missing"
  | "final-artifact-missing"
  | "generatedVideos-empty"
  | "download-failed"
  | "non-video-output"
  | "rejected-params"
  | "model-not-found"
  | "unknown";

export class VideoGenerationOutputError extends Error {
  code: VideoGenerationFailureCode;
  diagnostics: Record<string, unknown>;

  constructor(message: string, code: VideoGenerationFailureCode, diagnostics: Record<string, unknown>) {
    super(message);
    this.name = "VideoGenerationOutputError";
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

export type VeoGenerateInput = {
  apiKey?: string;
  model: string;
  prompt: string;
  negativePrompt?: string;
  /** The one valid conditioning shape for this request. */
  plan: ConditioningPlan;
  aspectRatio?: StudioAspectRatio;
  durationSeconds?: number;
  resolution?: "720p" | "1080p";
  /** Fixing a seed makes a re-run with identical inputs reproducible. */
  seed?: number;
};

export type VeoGenerateOutput = {
  bytes: Buffer;
  mimeType: string;
  /** Model ID as configured by the caller. */
  model: string;
  /** Model ID the Gemini API actually accepted. */
  resolvedModel: string;
  rawOutputUri: string | null;
  providerResponseMeta: Record<string, unknown>;
};

async function loadInlineImage(url: string, role: string) {
  const loaded = await loadImageReference({ url, role });
  if (!loaded.ok) {
    throw new Error(`Unable to load the ${role} image (${loaded.reason}).`);
  }
  return { imageBytes: loaded.image.base64Data, mimeType: loaded.image.mimeType };
}

/**
 * Turn a conditioning plan into the exact request the Gemini API accepts.
 *
 * The API treats reference images and frame conditioning as mutually exclusive
 * — `config.referenceImages` is documented as not supporting `image`, `video`
 * or `last_frame`. The previous implementation sent all three together, so
 * garment references silently failed to apply whenever a start frame was also
 * set. `ConditioningPlan` already resolved that conflict; this function's only
 * job is to render one branch of it faithfully and never merge branches.
 */
export async function buildVeoRequest(input: VeoGenerateInput) {
  const { plan } = input;

  const config: Record<string, unknown> = {
    numberOfVideos: 1,
    aspectRatio: input.aspectRatio ?? "9:16",
  };

  if (typeof input.durationSeconds === "number") config.durationSeconds = input.durationSeconds;
  if (input.resolution) config.resolution = input.resolution;
  if (typeof input.seed === "number") config.seed = input.seed;
  if (input.negativePrompt?.trim()) config.negativePrompt = input.negativePrompt.trim();

  let source: Record<string, unknown> = { prompt: input.prompt };

  switch (plan.mode) {
    case "interpolate": {
      // Both endpoints real: the garment is pinned at the first and last frame.
      const [first, last] = await Promise.all([
        loadInlineImage(plan.startFrame!.url, "first frame"),
        loadInlineImage(plan.endFrame!.url, "final frame"),
      ]);
      source = { prompt: input.prompt, image: first };
      config.lastFrame = last;
      break;
    }
    case "first-frame": {
      const first = await loadInlineImage(plan.startFrame!.url, "first frame");
      source = { prompt: input.prompt, image: first };
      break;
    }
    case "references": {
      const referenceImages: VideoGenerationReferenceImage[] = [];
      for (const reference of plan.references) {
        const image = await loadInlineImage(reference.url, `${reference.role ?? "garment"} reference`);
        referenceImages.push({ image, referenceType: VideoGenerationReferenceType.ASSET });
      }
      // No image / lastFrame here, by construction.
      config.referenceImages = referenceImages;
      break;
    }
    case "text":
      break;
  }

  return { source, config };
}

export async function generateVeoVideo(input: VeoGenerateInput): Promise<VeoGenerateOutput> {
  const apiKey = input.apiKey ?? process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GOOGLE_API_KEY or GEMINI_API_KEY environment variable.");

  const aspectRatio = (input.aspectRatio ?? "9:16") as StudioAspectRatio;
  if (!SUPPORTED_ASPECT_RATIOS.includes(aspectRatio as (typeof SUPPORTED_ASPECT_RATIOS)[number])) {
    throw new Error("Video generation supports 16:9 and 9:16 aspect ratios only.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const pollingConfig = getPollingConfig();
  const modelCandidates = resolveVeoModelCandidates(input.model);
  const { source, config } = await buildVeoRequest({ ...input, aspectRatio });

  let operation;
  let resolvedModel = modelCandidates[0];
  const modelAttempts: Array<{ model: string; ok: boolean; reason?: string }> = [];

  // Google rotates Veo model IDs between `-preview` and `-001` spellings and
  // retires older generations, so a single hard-coded ID eventually 404s.
  for (let index = 0; index < modelCandidates.length; index += 1) {
    const candidateModel = modelCandidates[index];
    try {
      console.log("[veo] request.start", {
        configuredModel: input.model,
        model: candidateModel,
        conditioningMode: input.plan.mode,
        hasFirstFrame: "image" in source,
        hasLastFrame: "lastFrame" in config,
        referenceCount: Array.isArray(config.referenceImages) ? config.referenceImages.length : 0,
        aspectRatio,
        durationSeconds: input.durationSeconds ?? null,
        promptLength: input.prompt.length,
      });
      operation = await ai.models.generateVideos({ model: candidateModel, source, config });
      resolvedModel = candidateModel;
      modelAttempts.push({ model: candidateModel, ok: true });
      break;
    } catch (error) {
      console.error("[veo] generateVideos failed", { model: candidateModel, error });
      let mapped: unknown = error;
      try {
        mapGeminiProviderError(error);
      } catch (providerError) {
        mapped = providerError;
      }

      const isLast = index === modelCandidates.length - 1;
      if (mapped instanceof ProviderModelNotFoundError && !isLast) {
        modelAttempts.push({ model: candidateModel, ok: false, reason: "model-not-found" });
        continue;
      }
      if (mapped instanceof ProviderModelNotFoundError) {
        throw new ProviderModelNotFoundError(
          `This model ID is not available on the current Gemini API path (tried: ${modelCandidates.join(", ")}).`,
          { ...mapped.meta },
        );
      }
      throw mapped;
    }
  }

  if (!operation) {
    throw new VideoGenerationOutputError("Video generation failed before an operation was returned.", "no-operation", {
      requestedModelId: input.model,
      modelCandidates,
      modelAttempts,
    });
  }

  let pollCount = 0;
  while (!operation.done && pollCount < pollingConfig.maxPolls) {
    await new Promise((resolve) => setTimeout(resolve, pollingConfig.pollIntervalMs));
    try {
      operation = await ai.operations.getVideosOperation({ operation });
    } catch (error) {
      console.error("[veo] poll failed", { pollCount, error });
      mapGeminiProviderError(error);
    }
    pollCount += 1;
  }

  const baseDiagnostics = {
    requestedModelId: input.model,
    resolvedModelId: resolvedModel,
    conditioningMode: input.plan.mode,
    pollCount,
    operationName: typeof operation.name === "string" ? operation.name : null,
  };

  if (!operation.done) {
    throw new VideoGenerationOutputError(
      "The provider accepted the request but did not finish rendering before the timeout.",
      "operation-not-done",
      { ...baseDiagnostics, polling: pollingConfig },
    );
  }

  if (operation.error) {
    throw new VideoGenerationOutputError(
      "The provider finished with an error before any video was produced.",
      "operation-error",
      { ...baseDiagnostics, providerError: operation.error },
    );
  }

  if (!operation.response) {
    throw new VideoGenerationOutputError(
      "The provider completed the request but returned an empty payload.",
      "response-missing",
      baseDiagnostics,
    );
  }

  const generatedVideo = operation.response?.generatedVideos?.[0]?.video as GeneratedVideoLike | undefined;

  if (!generatedVideo) {
    const assetCandidates = collectVeoAssetCandidates(operation.response as Record<string, unknown> | undefined);
    throw new VideoGenerationOutputError(
      "The provider completed the request but returned no video. Try a simpler request: fewer references, or a shorter turn.",
      "generatedVideos-empty",
      {
        ...baseDiagnostics,
        generatedVideosCount: operation.response?.generatedVideos?.length ?? 0,
        candidateTypes: assetCandidates.map((asset) => asset.type),
      },
    );
  }

  const derivedMimeType = generatedVideo.mimeType ?? "video/mp4";
  if (!derivedMimeType.toLowerCase().startsWith("video/")) {
    throw new VideoGenerationOutputError("The provider returned a non-video output.", "non-video-output", {
      ...baseDiagnostics,
      mimeType: derivedMimeType,
    });
  }

  let bytes: Buffer | null = null;
  let downloadDiagnostics: ResolveVideoBytesDiagnostics | null = null;
  try {
    const resolved = await resolveVideoBytes({ ai, apiKey, video: generatedVideo });
    bytes = resolved.bytes;
    downloadDiagnostics = resolved.diagnostics;
  } catch (error) {
    throw new VideoGenerationOutputError("Downloading the finished video failed.", "download-failed", {
      ...baseDiagnostics,
      providerDownloadError: error instanceof Error ? error.message : String(error),
    });
  }

  if (!bytes) {
    throw new VideoGenerationOutputError("Downloading the finished video failed.", "download-failed", {
      ...baseDiagnostics,
      bytesResolved: false,
    });
  }

  return {
    bytes,
    mimeType: derivedMimeType,
    model: input.model,
    resolvedModel,
    rawOutputUri: generatedVideo.uri ?? null,
    providerResponseMeta: {
      ...baseDiagnostics,
      modelCandidates,
      modelAttempts,
      conditioningRationale: input.plan.rationale,
      droppedInputs: input.plan.dropped.map((entry) => ({ url: entry.image.url, reason: entry.reason })),
      generatedVideo: {
        uri: generatedVideo.uri ?? null,
        downloadUri: generatedVideo.downloadUri ?? null,
        fileName: generatedVideo.name ?? extractFileNameFromVideoUri(generatedVideo.uri) ?? null,
        mimeType: derivedMimeType,
      },
      finalStatus: summarizeOperation(operation),
      downloadDiagnostics,
    },
  };
}
