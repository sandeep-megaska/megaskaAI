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
  supportsFrameAnchors: boolean;
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
    return { supportsFrameAnchors: true, supportsReferenceImages: true };
  }

  if (normalized.startsWith("veo-2")) {
    return { supportsFrameAnchors: true, supportsReferenceImages: true };
  }

  return { supportsFrameAnchors: false, supportsReferenceImages: false };
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

  const sourceImage = support.supportsFrameAnchors && firstFrameUrl ? await loadInlineImage(firstFrameUrl, "first-frame") : null;
  const lastFrame = support.supportsFrameAnchors && lastFrameUrl ? await loadInlineImage(lastFrameUrl, "last-frame") : null;

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
      requestedReferenceCount: (input.referenceImageUrls ?? []).length,
      attachedReferenceCount: referenceImages.length,
      droppedReferenceCount: Math.max((input.referenceImageUrls ?? []).length - referenceImages.length, 0),
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
    throw new Error("Video generation failed before an operation was returned.");
  }

  console.log("[veo-video-adapter] provider operation accepted", {
    done: Boolean(operation.done),
    hasResponse: Boolean(operation.response),
  });

  let pollCount = 0;
  while (!operation.done && pollCount < 60) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
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
    throw new Error("Video generation timed out before completion.");
  }

  const generatedVideo = operation.response?.generatedVideos?.[0]?.video as GeneratedVideoLike | undefined;
  if (!generatedVideo) {
    console.error("[veo-video-adapter] completed operation missing generated video", {
      pollCount,
      hasResponse: Boolean(operation.response),
      generatedVideosCount: operation.response?.generatedVideos?.length ?? 0,
    });
    throw new Error("Video generation returned no video output.");
  }

  console.log("[veo-video-adapter] provider response payload summary", {
    pollCount,
    generatedVideosCount: operation.response?.generatedVideos?.length ?? 0,
    mimeType: generatedVideo.mimeType ?? "video/mp4",
    outputVideoUri: generatedVideo.uri ?? null,
    outputVideoDownloadUri: generatedVideo.downloadUri ?? null,
    outputVideoFileName:
      generatedVideo.name ?? extractFileNameFromVideoUri(generatedVideo.uri ?? undefined) ?? null,
    hasInlineVideoBytes: Boolean(generatedVideo.videoBytes),
  });

  const { bytes, diagnostics } = await resolveVideoBytes({
    ai,
    apiKey,
    video: generatedVideo,
  });
  console.log("[veo-video-adapter] resolved provider video bytes diagnostics", diagnostics);

  if (!bytes) {
    throw new Error("Unable to resolve generated video bytes.");
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
      generatedVideo: {
        uri: generatedVideo.uri ?? null,
        downloadUri: generatedVideo.downloadUri ?? null,
        fileName: generatedVideo.name ?? extractFileNameFromVideoUri(generatedVideo.uri ?? undefined) ?? null,
        mimeType: generatedVideo.mimeType ?? "video/mp4",
      },
      frameInputDiagnostics: frameInput.diagnostics,
      modelFrameSupport: frameInput.support,
      downloadDiagnostics: diagnostics,
    },
  };
}
