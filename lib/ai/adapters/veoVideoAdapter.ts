import {
  GoogleGenAI,
  VideoGenerationReferenceType,
  type VideoGenerationReferenceImage,
} from "@google/genai";
import { loadImageReference } from "@/lib/ai/loadImageReference";
import { mapGeminiProviderError } from "@/lib/ai/providerErrors";
import { type StudioAspectRatio } from "@/lib/studio/aspectRatios";

const SUPPORTED_VEO_ASPECT_RATIOS = ["16:9", "9:16"] as const;
type VeoAspectRatio = (typeof SUPPORTED_VEO_ASPECT_RATIOS)[number];

const MAX_REFERENCE_IMAGES = 3;
const MAX_SAFE_POLLS = 60;
const POLL_INTERVAL_MS = 5000;

export type VideoGenerationFailureCode =
  | "no-operation"
  | "operation-not-done"
  | "response-missing"
  | "generatedVideos-empty"
  | "download-failed"
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

type VeoInput = {
  apiKey?: string;
  model: string;
  prompt: string;
  firstFrameUrl?: string | null;
  lastFrameUrl?: string | null;
  referenceImageUrls?: string[];
  aspectRatio?: StudioAspectRatio;
  durationSeconds?: number;
};

type VeoOutput = {
  bytes: Buffer;
  mimeType: string;
  model: string;
  rawOutputUri: string | null;
  providerResponseMeta: Record<string, unknown>;
};

type GeneratedVideoLike = {
  videoBytes?: string;
  uri?: string;
  mimeType?: string;
  downloadUri?: string;
  name?: string;
};

type GeneratedAssetCandidate = {
  index: number;
  source: string;
  role: "video" | "image" | "thumbnail" | "poster" | "unknown";
  mimeType: string | null;
  uri: string | null;
  downloadUri: string | null;
  name: string | null;
  videoBytes: string | undefined;
};

type ResolveVideoBytesDiagnostics = {
  hasInlineVideoBytes: boolean;
  uri: string | null;
  downloadUri: string | null;
  fileName: string | null;
  attemptedDownloadUrl: string | null;
  attemptedDownloadSource: "inline-bytes" | "downloadUri" | "uri" | null;
  attemptedWithAuthHeaders: boolean;
  fetchStatus: number | null;
  fetchStatusText: string | null;
  bytesLength: number;
};

type FrameSupport = {
  supportsSourceImage: boolean;
  supportsLastFrame: boolean;
  supportsReferenceImages: boolean;
};

function extractFileNameFromVideoUri(uri: string | undefined): string | null {
  if (!uri) {
    return null;
  }

  const directFilesNameMatch = uri.match(/\/files\/([^/?#]+)/i);
  if (directFilesNameMatch?.[1]) {
    return `files/${decodeURIComponent(directFilesNameMatch[1])}`;
  }

  return null;
}

function getVeoFrameSupport(model: string): FrameSupport {
  const normalized = model.trim().toLowerCase();

  if (normalized.startsWith("veo-3.1")) {
    return { supportsSourceImage: true, supportsLastFrame: true, supportsReferenceImages: true };
  }

  if (normalized.startsWith("veo-3.0-fast")) {
    return { supportsSourceImage: true, supportsLastFrame: false, supportsReferenceImages: true };
  }

  if (normalized.startsWith("veo-3")) {
    return { supportsSourceImage: true, supportsLastFrame: true, supportsReferenceImages: true };
  }

  if (normalized.startsWith("veo-2")) {
    return { supportsSourceImage: true, supportsLastFrame: false, supportsReferenceImages: false };
  }

  return { supportsSourceImage: false, supportsLastFrame: false, supportsReferenceImages: false };
}

async function loadInlineImage(url: string, role: string) {
  const loaded = await loadImageReference({ url, role });
  if (!loaded.ok) {
    throw new Error(`Unable to load ${role} image (${loaded.reason}).`);
  }

  return {
    imageBytes: loaded.image.base64Data,
    mimeType: loaded.image.mimeType,
  };
}

async function buildFrameInputs(input: {
  model: string;
  firstFrameUrl?: string | null;
  lastFrameUrl?: string | null;
  referenceImageUrls?: string[];
}) {
  const support = getVeoFrameSupport(input.model);
  const firstFrameUrl = input.firstFrameUrl?.trim() || null;
  const lastFrameUrl = input.lastFrameUrl?.trim() || null;

  const uniqueReferenceUrls = Array.from(
    new Set((input.referenceImageUrls ?? []).map((value) => value.trim()).filter(Boolean)),
  )
    .filter((url) => url !== firstFrameUrl && url !== lastFrameUrl)
    .slice(0, MAX_REFERENCE_IMAGES);

  const sourceImage = support.supportsSourceImage && firstFrameUrl ? await loadInlineImage(firstFrameUrl, "first-frame") : null;
  const lastFrame = support.supportsLastFrame && lastFrameUrl ? await loadInlineImage(lastFrameUrl, "last-frame") : null;

  const referenceImages: VideoGenerationReferenceImage[] = [];
  if (support.supportsReferenceImages) {
    for (const url of uniqueReferenceUrls) {
      const image = await loadInlineImage(url, "reference-frame");
      referenceImages.push({ image, referenceType: VideoGenerationReferenceType.ASSET });
    }
  }

  return {
    support,
    sourceImage,
    lastFrame,
    referenceImages,
    diagnostics: {
      firstFrameRequested: Boolean(firstFrameUrl),
      lastFrameRequested: Boolean(lastFrameUrl),
      sourceImageAttached: Boolean(sourceImage),
      lastFrameAttached: Boolean(lastFrame),
      sourceImageDroppedAsUnsupported: Boolean(firstFrameUrl) && !sourceImage,
      lastFrameDroppedAsUnsupported: Boolean(lastFrameUrl) && !lastFrame,
      requestedReferenceCount: (input.referenceImageUrls ?? []).length,
      attachedReferenceCount: referenceImages.length,
      droppedReferenceCount: Math.max((input.referenceImageUrls ?? []).length - referenceImages.length, 0),
      referencesDroppedAsUnsupported:
        !support.supportsReferenceImages && (input.referenceImageUrls ?? []).length > 0,
    },
  };
}

async function resolveVideoBytes({
  ai,
  apiKey,
  video,
}: {
  ai: GoogleGenAI;
  apiKey: string;
  video: GeneratedVideoLike;
}): Promise<{ bytes: Buffer | null; diagnostics: ResolveVideoBytesDiagnostics }> {
  const diagnostics: ResolveVideoBytesDiagnostics = {
    hasInlineVideoBytes: Boolean(video.videoBytes),
    uri: video.uri ?? null,
    downloadUri: video.downloadUri ?? null,
    fileName: video.name ?? extractFileNameFromVideoUri(video.uri) ?? null,
    attemptedDownloadUrl: null,
    attemptedDownloadSource: null,
    attemptedWithAuthHeaders: false,
    fetchStatus: null,
    fetchStatusText: null,
    bytesLength: 0,
  };

  if (video.videoBytes) {
    const bytes = Buffer.from(video.videoBytes, "base64");
    diagnostics.attemptedDownloadSource = "inline-bytes";
    diagnostics.bytesLength = bytes.length;
    return { bytes, diagnostics };
  }

  let downloadUri = video.downloadUri?.trim() || null;
  if (!downloadUri && diagnostics.fileName) {
    try {
      const fileInfo = await ai.files.get({ name: diagnostics.fileName });
      downloadUri = fileInfo.downloadUri?.trim() || null;
      diagnostics.downloadUri = downloadUri;
    } catch (error) {
      console.error("[veo-video-adapter] files.get for generated video failed", {
        fileName: diagnostics.fileName,
        error,
      });
    }
  }

  const downloadUrl = downloadUri ?? video.uri?.trim() ?? null;
  if (!downloadUrl) {
    return { bytes: null, diagnostics };
  }

  diagnostics.attemptedDownloadUrl = downloadUrl;
  diagnostics.attemptedDownloadSource = downloadUri ? "downloadUri" : "uri";
  diagnostics.attemptedWithAuthHeaders = true;

  const response = await fetch(downloadUrl, {
    headers: {
      "x-goog-api-key": apiKey,
    },
  });
  diagnostics.fetchStatus = response.status;
  diagnostics.fetchStatusText = response.statusText;

  if (!response.ok) {
    throw new Error(
      `Unable to download generated video bytes from provider (${response.status} ${response.statusText})`,
    );
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  diagnostics.bytesLength = bytes.length;
  return { bytes, diagnostics };
}

export async function runVeoVideoGeneration(input: VeoInput): Promise<VeoOutput> {
  const apiKey = input.apiKey ?? process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GOOGLE_API_KEY or GEMINI_API_KEY environment variable.");
  }

  const aspectRatio = (input.aspectRatio ?? "16:9") as StudioAspectRatio;
  if (!SUPPORTED_VEO_ASPECT_RATIOS.includes(aspectRatio as VeoAspectRatio)) {
    throw new Error("Video Project currently supports only 16:9 and 9:16 aspect ratios.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const frameInput = await buildFrameInputs({
    model: input.model,
    firstFrameUrl: input.firstFrameUrl,
    lastFrameUrl: input.lastFrameUrl,
    referenceImageUrls: input.referenceImageUrls,
  });

  const source = frameInput.sourceImage
    ? {
        image: frameInput.sourceImage,
        prompt: input.prompt,
      }
    : {
        prompt: input.prompt,
      };

  const config: Record<string, unknown> = {
    numberOfVideos: 1,
    aspectRatio,
  };

  if (typeof input.durationSeconds === "number") {
    config.durationSeconds = input.durationSeconds;
  }

  if (frameInput.lastFrame) {
    config.lastFrame = frameInput.lastFrame;
  }

  if (frameInput.referenceImages.length) {
    config.referenceImages = frameInput.referenceImages;
  }

  let operation;
  try {
    console.log("[veo-video-adapter] submitting video generation request", {
      model: input.model,
      aspectRatio,
      promptLength: input.prompt.length,
      frameInputDiagnostics: frameInput.diagnostics,
      modelFrameSupport: frameInput.support,
    });
    operation = await ai.models.generateVideos({
      model: input.model,
      source,
      config,
    });
  } catch (error) {
    console.error("[veo-video-adapter] generateVideos request failed", error);
    mapGeminiProviderError(error);
  }

  if (!operation) {
    throw new VideoGenerationOutputError("Video generation failed before an operation was returned.", "no-operation", {
      requestedModelId: input.model,
    });
  }

  console.log("[veo-video-adapter] provider operation accepted", {
    done: Boolean(operation.done),
    hasResponse: Boolean(operation.response),
  });

  let pollCount = 0;
  while (!operation.done && pollCount < MAX_SAFE_POLLS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    try {
      operation = await ai.operations.getVideosOperation({ operation });
    } catch (error) {
      console.error("[veo-video-adapter] getVideosOperation poll failed", {
        pollCount,
        error,
      });
      mapGeminiProviderError(error);
    }
    pollCount += 1;
  }

  if (!operation.done) {
    throw new VideoGenerationOutputError("Video generation timed out before completion.", "operation-not-done", {
      requestedModelId: input.model,
      pollCount,
      done: Boolean(operation.done),
      hasResponse: Boolean(operation.response),
      operationName: typeof operation.name === "string" ? operation.name : null,
    });
  }

  if (!operation.response) {
    throw new VideoGenerationOutputError("Video generation completed without a provider response payload.", "response-missing", {
      requestedModelId: input.model,
      pollCount,
      done: Boolean(operation.done),
      hasResponse: false,
      operationName: typeof operation.name === "string" ? operation.name : null,
    });
  }

  const providerEntries = Array.isArray(operation.response?.generatedVideos) ? operation.response.generatedVideos : [];
  const candidates: GeneratedAssetCandidate[] = providerEntries.flatMap((entry, entryIndex) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const assets: Array<{ source: string; role: GeneratedAssetCandidate["role"]; data: GeneratedVideoLike | null }> = [
      { source: "generatedVideos[].video", role: "video", data: (record.video as GeneratedVideoLike | undefined) ?? null },
      { source: "generatedVideos[].image", role: "image", data: (record.image as GeneratedVideoLike | undefined) ?? null },
      { source: "generatedVideos[].thumbnail", role: "thumbnail", data: (record.thumbnail as GeneratedVideoLike | undefined) ?? null },
      { source: "generatedVideos[].poster", role: "poster", data: (record.poster as GeneratedVideoLike | undefined) ?? null },
    ];
    return assets
      .filter((asset) => asset.data && typeof asset.data === "object")
      .map((asset) => ({
        index: entryIndex,
        source: asset.source,
        role: asset.role,
        mimeType: typeof asset.data?.mimeType === "string" ? asset.data.mimeType : null,
        uri: typeof asset.data?.uri === "string" ? asset.data.uri : null,
        downloadUri: typeof asset.data?.downloadUri === "string" ? asset.data.downloadUri : null,
        name: typeof asset.data?.name === "string" ? asset.data.name : null,
        videoBytes: asset.data?.videoBytes,
      }));
  });

  const selectedCandidate =
    candidates.find((candidate) => Boolean(candidate.videoBytes) || (candidate.mimeType?.toLowerCase().startsWith("video/") ?? false) || candidate.role === "video")
    ?? candidates[0]
    ?? null;
  const generatedVideo = selectedCandidate as (GeneratedAssetCandidate & GeneratedVideoLike) | null;
  if (!generatedVideo) {
    console.error("[veo-video-adapter] completed operation missing generated video", {
      pollCount,
      hasResponse: Boolean(operation.response),
      generatedVideosCount: operation.response?.generatedVideos?.length ?? 0,
    });
    throw new VideoGenerationOutputError(
      "The provider completed the request but returned no video output. Retry with a simpler Veo 3.1 request.",
      "generatedVideos-empty",
      {
        requestedModelId: input.model,
        pollCount,
        done: Boolean(operation.done),
        hasResponse: Boolean(operation.response),
        generatedVideosCount: operation.response?.generatedVideos?.length ?? 0,
        operationName: typeof operation.name === "string" ? operation.name : null,
      },
    );
  }

  if (process.env.NODE_ENV !== "production") {
    console.log("[veo-video-adapter] provider response asset diagnostics", {
      pollCount,
      generatedVideosCount: providerEntries.length,
      outputAssetCandidates: candidates.map((candidate) => ({
        index: candidate.index,
        source: candidate.source,
        role: candidate.role,
        mimeType: candidate.mimeType,
        hasUri: Boolean(candidate.uri),
        hasDownloadUri: Boolean(candidate.downloadUri),
        hasInlineBytes: Boolean(candidate.videoBytes),
      })),
      selectedAsset: selectedCandidate
        ? {
            index: selectedCandidate.index,
            source: selectedCandidate.source,
            role: selectedCandidate.role,
            mimeType: selectedCandidate.mimeType,
            hasUri: Boolean(selectedCandidate.uri),
            hasDownloadUri: Boolean(selectedCandidate.downloadUri),
            hasInlineBytes: Boolean(selectedCandidate.videoBytes),
          }
        : null,
      hasThumbnailOrPoster: candidates.some((candidate) => candidate.role === "thumbnail" || candidate.role === "poster"),
    });
  }

  let bytes: Buffer | null = null;
  let diagnostics: ResolveVideoBytesDiagnostics | null = null;
  try {
    const resolved = await resolveVideoBytes({
      ai,
      apiKey,
      video: generatedVideo,
    });
    bytes = resolved.bytes;
    diagnostics = resolved.diagnostics;
  } catch (error) {
    throw new VideoGenerationOutputError(
      "The provider generated a result but the video could not be downloaded.",
      "download-failed",
      {
        requestedModelId: input.model,
        operationName: typeof operation.name === "string" ? operation.name : null,
        pollCount,
        providerDownloadError: error instanceof Error ? error.message : String(error),
      },
    );
  }
  console.log("[veo-video-adapter] resolved provider video bytes diagnostics", diagnostics);

  if (!bytes) {
    throw new VideoGenerationOutputError("The provider generated a result but the video could not be downloaded.", "download-failed", {
      requestedModelId: input.model,
      operationName: typeof operation.name === "string" ? operation.name : null,
      pollCount,
      bytesResolved: false,
    });
  }

  return {
    bytes,
    mimeType: generatedVideo.mimeType ?? "video/mp4",
    model: input.model,
    rawOutputUri: generatedVideo.uri ?? null,
    providerResponseMeta: {
      operationName: typeof operation.name === "string" ? operation.name : null,
      done: Boolean(operation.done),
      pollCount,
      generatedVideoCount: operation.response?.generatedVideos?.length ?? 0,
      hasResponse: Boolean(operation.response),
      requestedModelId: input.model,
      responseSummary: {
        hasGeneratedVideosArray: Array.isArray(operation.response?.generatedVideos),
        generatedVideosLength: operation.response?.generatedVideos?.length ?? 0,
      },
      generatedVideo: {
        selectedAssetIndex: selectedCandidate?.index ?? null,
        selectedAssetSource: selectedCandidate?.source ?? null,
        selectedAssetRole: selectedCandidate?.role ?? null,
        uri: generatedVideo.uri ?? null,
        downloadUri: generatedVideo.downloadUri ?? null,
        fileName: generatedVideo.name ?? extractFileNameFromVideoUri(generatedVideo.uri ?? undefined) ?? null,
        mimeType: generatedVideo.mimeType ?? "video/mp4",
      },
      availableGeneratedAssets:
        process.env.NODE_ENV !== "production"
          ? candidates.map((candidate) => ({
              index: candidate.index,
              source: candidate.source,
              role: candidate.role,
              mimeType: candidate.mimeType,
              hasUri: Boolean(candidate.uri),
              hasDownloadUri: Boolean(candidate.downloadUri),
              hasInlineBytes: Boolean(candidate.videoBytes),
            }))
          : undefined,
      frameInputDiagnostics: frameInput.diagnostics,
      modelFrameSupport: frameInput.support,
      downloadDiagnostics: diagnostics,
    },
  };
}
