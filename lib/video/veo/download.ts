import { GoogleGenAI } from "@google/genai";

const DEFAULT_MAX_SAFE_POLLS = 96;
const DEFAULT_POLL_INTERVAL_MS = 5000;

/**
 * Locating and downloading the finished video.
 *
 * Lifted unchanged from the previous adapter: this half was working and is the
 * fiddly part (the provider returns bytes inline, or a signed download URI, or
 * only a Files API name, and which one varies by model and by request). Keeping
 * it isolated let the request-shaping half be rewritten without disturbing it.
 */

export type GeneratedVideoLike = {
  videoBytes?: string;
  uri?: string;
  mimeType?: string;
  downloadUri?: string;
  name?: string;
  type?: string;
  role?: string;
};

export type ResolveVideoBytesDiagnostics = {
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

export type VeoAssetCandidate = {
  index: number;
  type: "video" | "image" | "unknown";
  role: string | null;
  url: string | null;
  mimeType: string | null;
  video: GeneratedVideoLike | null;
};

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export function getPollingConfig() {
  const pollIntervalMs = parsePositiveInt(process.env.VEO_VIDEO_POLL_INTERVAL_MS, DEFAULT_POLL_INTERVAL_MS);
  const maxPolls = parsePositiveInt(process.env.VEO_VIDEO_MAX_POLLS, DEFAULT_MAX_SAFE_POLLS);
  return {
    pollIntervalMs,
    maxPolls,
    maxWaitMs: pollIntervalMs * maxPolls,
  };
}

function getSdkHttpStatus(sdkHttpResponse: unknown): number | null {
  if (!sdkHttpResponse || typeof sdkHttpResponse !== "object") {
    return null;
  }

  const httpResponse = sdkHttpResponse as { status?: unknown; statusCode?: unknown };
  if (typeof httpResponse.status === "number") {
    return httpResponse.status;
  }

  if (typeof httpResponse.statusCode === "number") {
    return httpResponse.statusCode;
  }

  return null;
}

export function summarizeOperation(operation: {
  name?: string;
  done?: boolean;
  error?: Record<string, unknown>;
  response?: unknown;
  sdkHttpResponse?: unknown;
}) {
  const response = operation.response as Record<string, unknown> | undefined;
  return {
    operationName: typeof operation.name === "string" ? operation.name : null,
    done: Boolean(operation.done),
    hasResponse: Boolean(operation.response),
    hasError: Boolean(operation.error),
    error: operation.error ?? null,
    httpStatus: getSdkHttpStatus(operation.sdkHttpResponse),
    generatedVideosLength: Array.isArray(response?.generatedVideos) ? response.generatedVideos.length : 0,
  };
}

function normalizeAssetType(value: unknown): "video" | "image" | "unknown" {
  if (typeof value !== "string") return "unknown";
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("video")) return "video";
  if (normalized.includes("image")) return "image";
  return "unknown";
}

export function collectVeoAssetCandidates(response: Record<string, unknown> | undefined): VeoAssetCandidate[] {
  const candidates: VeoAssetCandidate[] = [];
  if (!response || typeof response !== "object") {
    return candidates;
  }

  const generatedVideos = Array.isArray(response.generatedVideos) ? response.generatedVideos : [];
  generatedVideos.forEach((entry) => {
    const video = (entry as { video?: GeneratedVideoLike })?.video;
    if (!video) return;
    candidates.push({
      index: candidates.length,
      type: "video",
      role: "main",
      url: video.downloadUri?.trim() || video.uri?.trim() || null,
      mimeType: video.mimeType ?? null,
      video,
    });
  });

  const rawAssets = Array.isArray((response as { assets?: unknown[] }).assets)
    ? ((response as { assets?: unknown[] }).assets as unknown[])
    : [];

  rawAssets.forEach((asset) => {
    const typed = asset as {
      type?: unknown;
      role?: unknown;
      mimeType?: unknown;
      url?: unknown;
      uri?: unknown;
      downloadUri?: unknown;
      video?: GeneratedVideoLike;
    };
    const assetType = normalizeAssetType(typed.type);
    const mimeType = typeof typed.mimeType === "string" ? typed.mimeType : null;
    const role = typeof typed.role === "string" ? typed.role : null;
    const url =
      (typeof typed.url === "string" && typed.url.trim())
      || (typeof typed.downloadUri === "string" && typed.downloadUri.trim())
      || (typeof typed.uri === "string" && typed.uri.trim())
      || null;
    candidates.push({
      index: candidates.length,
      type: assetType,
      role,
      url,
      mimeType,
      video: assetType === "video" ? (typed.video ?? (typed as GeneratedVideoLike)) : null,
    });
  });

  return candidates;
}

export function extractFileNameFromVideoUri(uri: string | undefined): string | null {
  if (!uri) {
    return null;
  }

  const directFilesNameMatch = uri.match(/\/files\/([^/?#]+)/i);
  if (directFilesNameMatch?.[1]) {
    return `files/${decodeURIComponent(directFilesNameMatch[1])}`;
  }

  return null;
}

export async function resolveVideoBytes({
  ai,
  apiKey,
  video,
}: {
  ai: GoogleGenAI;
  apiKey: string;
  video: GeneratedVideoLike;
}): Promise<{ bytes: Buffer | null; diagnostics: ResolveVideoBytesDiagnostics }> {
  const MIN_VIDEO_BYTES = 64 * 1024;

  const isValidVideoContentType = (contentType: string | null): boolean => {
    if (!contentType) return false;
    return contentType.trim().toLowerCase().startsWith("video/");
  };

  const fetchVideoBytes = async ({
    url,
    mode,
    withApiKeyHeader,
  }: {
    url: string;
    mode: "no-auth" | "api-key" | "files-api";
    withApiKeyHeader: boolean;
  }): Promise<{ bytes: Buffer; contentType: string | null }> => {
    const response = await fetch(
      url,
      withApiKeyHeader
        ? {
            headers: {
              "x-goog-api-key": apiKey,
            },
          }
        : undefined,
    );

    diagnostics.fetchStatus = response.status;
    diagnostics.fetchStatusText = response.statusText;
    diagnostics.attemptedWithAuthHeaders = withApiKeyHeader;
    const contentType = response.headers.get("content-type");

    if (!response.ok) {
      throw new Error(
        `Unable to download generated video bytes from provider (${response.status} ${response.statusText})`,
      );
    }

    if (!isValidVideoContentType(contentType)) {
      throw new Error(
        `Invalid generated video content-type "${contentType ?? "unknown"}" for ${mode} download mode.`,
      );
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < MIN_VIDEO_BYTES) {
      throw new Error(`Video too small / likely invalid (${bytes.length} bytes).`);
    }

    diagnostics.bytesLength = bytes.length;
    console.log("[veo-download]", {
      url,
      mode,
      contentType,
      bytesLength: bytes.length,
    });

    return { bytes, contentType };
  };

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
  diagnostics.attemptedWithAuthHeaders = false;

  try {
    const { bytes } = await fetchVideoBytes({
      url: downloadUrl,
      mode: "no-auth",
      withApiKeyHeader: false,
    });
    return { bytes, diagnostics };
  } catch {
    try {
      const { bytes } = await fetchVideoBytes({
        url: downloadUrl,
        mode: "api-key",
        withApiKeyHeader: true,
      });
      return { bytes, diagnostics };
    } catch (secondError) {
      if (!diagnostics.fileName) {
        throw secondError;
      }

      const fileInfo = await ai.files.get({ name: diagnostics.fileName });
      const filesApiUrl = fileInfo.downloadUri?.trim();
      diagnostics.downloadUri = filesApiUrl ?? diagnostics.downloadUri;

      if (!filesApiUrl) {
        throw secondError;
      }

      diagnostics.attemptedDownloadSource = "downloadUri";
      diagnostics.attemptedDownloadUrl = filesApiUrl;
      const { bytes } = await fetchVideoBytes({
        url: filesApiUrl,
        mode: "files-api",
        withApiKeyHeader: false,
      });
      return { bytes, diagnostics };
    }
  }
}

