export type OutputAssetKind = "video" | "image" | "unknown";
export type OutputAssetConfidence = "high" | "medium" | "low";
export type OutputAssetMismatchReason =
  | "provider_returned_image_instead_of_video"
  | "provider_returned_unknown_output_for_video_request"
  | "provider_returned_video_instead_of_image";

export type ClassifyOutputAssetInput = {
  expectedKind?: "video" | "image" | null;
  observedMimeType?: string | null;
  providerMimeType?: string | null;
  persistedFileType?: string | null;
  outputUrl?: string | null;
};

export type ClassifyOutputAssetResult = {
  kind: OutputAssetKind;
  mimeType: string | null;
  reason: string;
  confidence: OutputAssetConfidence;
  expectedKind: "video" | "image" | null;
  mismatch: boolean;
  mismatchReason: OutputAssetMismatchReason | null;
};

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif", "bmp", "tiff", "heic", "heif"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v", "mkv", "avi", "mpeg", "mpg"]);

function normalizeMime(value?: string | null) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed || null;
}

function classifyByMime(mimeType?: string | null): OutputAssetKind {
  const mime = normalizeMime(mimeType);
  if (!mime) return "unknown";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "image";
  return "unknown";
}

function extensionFromUrl(url?: string | null) {
  if (typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).pop() ?? "";
    const ext = last.includes(".") ? last.split(".").pop()?.toLowerCase() ?? null : null;
    return ext || null;
  } catch {
    return null;
  }
}

function classifyByExtension(url?: string | null): OutputAssetKind {
  const extension = extensionFromUrl(url);
  if (!extension) return "unknown";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  return "unknown";
}

function mismatchReason(expectedKind: "video" | "image" | null, actualKind: OutputAssetKind): OutputAssetMismatchReason | null {
  if (!expectedKind || expectedKind === actualKind) return null;
  if (expectedKind === "video" && actualKind === "image") return "provider_returned_image_instead_of_video";
  if (expectedKind === "video" && actualKind === "unknown") return "provider_returned_unknown_output_for_video_request";
  if (expectedKind === "image" && actualKind === "video") return "provider_returned_video_instead_of_image";
  return null;
}

export function classifyOutputAsset(input: ClassifyOutputAssetInput): ClassifyOutputAssetResult {
  const expectedKind = input.expectedKind ?? null;
  const observedMime = normalizeMime(input.observedMimeType);
  const providerMime = normalizeMime(input.providerMimeType);
  const persistedMime = normalizeMime(input.persistedFileType);
  const extensionKind = classifyByExtension(input.outputUrl);

  const observedKind = classifyByMime(observedMime);
  if (observedKind !== "unknown") {
    const mismatch = expectedKind ? expectedKind !== observedKind : false;
    return {
      kind: observedKind,
      mimeType: observedMime,
      reason: "classified_from_observed_mime_type",
      confidence: "high",
      expectedKind,
      mismatch,
      mismatchReason: mismatchReason(expectedKind, observedKind),
    };
  }

  const providerKind = classifyByMime(providerMime);
  if (providerKind !== "unknown") {
    const mismatch = expectedKind ? expectedKind !== providerKind : false;
    return {
      kind: providerKind,
      mimeType: providerMime,
      reason: "classified_from_provider_metadata_mime_type",
      confidence: "medium",
      expectedKind,
      mismatch,
      mismatchReason: mismatchReason(expectedKind, providerKind),
    };
  }

  const persistedKind = classifyByMime(persistedMime);
  if (persistedKind !== "unknown") {
    const mismatch = expectedKind ? expectedKind !== persistedKind : false;
    return {
      kind: persistedKind,
      mimeType: persistedMime,
      reason: "classified_from_persisted_file_type",
      confidence: "medium",
      expectedKind,
      mismatch,
      mismatchReason: mismatchReason(expectedKind, persistedKind),
    };
  }

  if (extensionKind !== "unknown") {
    const mismatch = expectedKind ? expectedKind !== extensionKind : false;
    return {
      kind: extensionKind,
      mimeType: null,
      reason: "classified_from_output_url_extension",
      confidence: "low",
      expectedKind,
      mismatch,
      mismatchReason: mismatchReason(expectedKind, extensionKind),
    };
  }

  const unknownMismatch = expectedKind === "video";
  return {
    kind: "unknown",
    mimeType: observedMime ?? providerMime ?? persistedMime ?? null,
    reason: "unable_to_classify_output_asset_kind",
    confidence: "low",
    expectedKind,
    mismatch: unknownMismatch,
    mismatchReason: mismatchReason(expectedKind, "unknown"),
  };
}
