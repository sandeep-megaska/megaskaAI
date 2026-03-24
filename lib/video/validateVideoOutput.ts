const MIN_PLAYABLE_VIDEO_BYTES = 64 * 1024;

type ValidationInput = {
  provider: string;
  outputUrl: string | null;
  mimeType: string | null;
  bytesLength: number;
  durationSeconds?: number | null;
};

export type OutputAssetClassification = {
  expected_output_kind: "video" | "image";
  actual_output_kind: "video" | "image" | "unknown";
  mime_type: string | null;
  mismatch: boolean;
  mismatch_reason: string | null;
  confidence: number;
};

export type VideoOutputValidation = {
  valid: boolean;
  errorMessage: string | null;
  checks: {
    hasOutputUrl: boolean;
    retrievable: boolean;
    isVideoMime: boolean;
    aboveMinSize: boolean;
    hasPositiveDuration: boolean | null;
  };
  observed: {
    provider: string;
    contentType: string | null;
    fileSizeBytes: number;
    durationSeconds: number | null;
    minBytesRequired: number;
  };
};

export function classifyOutputAsset(input: {
  expectedOutputKind: "video" | "image";
  mimeType?: string | null;
  url?: string | null;
}): OutputAssetClassification {
  const normalizedMime = input.mimeType?.trim().toLowerCase() ?? null;
  const normalizedUrl = input.url?.trim().toLowerCase() ?? null;

  let actual: "video" | "image" | "unknown" = "unknown";
  let confidence = 0.35;

  if (normalizedMime?.startsWith("video/")) {
    actual = "video";
    confidence = 0.99;
  } else if (normalizedMime?.startsWith("image/")) {
    actual = "image";
    confidence = 0.99;
  } else if (normalizedUrl?.match(/\.(mp4|mov|webm)(\?|#|$)/)) {
    actual = "video";
    confidence = 0.7;
  } else if (normalizedUrl?.match(/\.(jpg|jpeg|png|webp)(\?|#|$)/)) {
    actual = "image";
    confidence = 0.7;
  }

  const mismatch = actual !== input.expectedOutputKind;
  return {
    expected_output_kind: input.expectedOutputKind,
    actual_output_kind: actual,
    mime_type: normalizedMime,
    mismatch,
    mismatch_reason: mismatch ? `Expected ${input.expectedOutputKind} but observed ${actual}.` : null,
    confidence,
  };
}

export function validatePlayableVideoOutput(input: ValidationInput): VideoOutputValidation {
  const normalizedMime = input.mimeType?.trim().toLowerCase() ?? null;
  const hasOutputUrl = Boolean(input.outputUrl?.trim());
  const retrievable = Number.isFinite(input.bytesLength) && input.bytesLength > 0;
  const isVideoMime = Boolean(normalizedMime?.startsWith("video/"));
  const aboveMinSize = input.bytesLength >= MIN_PLAYABLE_VIDEO_BYTES;
  const durationKnown = typeof input.durationSeconds === "number" && Number.isFinite(input.durationSeconds);
  const hasPositiveDuration = durationKnown ? (input.durationSeconds as number) > 0 : null;

  const checks = {
    hasOutputUrl,
    retrievable,
    isVideoMime,
    aboveMinSize,
    hasPositiveDuration,
  };

  const valid = hasOutputUrl && retrievable && isVideoMime && aboveMinSize && (hasPositiveDuration ?? true);

  const errorMessage = valid ? null : "Provider returned an unplayable video output.";

  return {
    valid,
    errorMessage,
    checks,
    observed: {
      provider: input.provider,
      contentType: normalizedMime,
      fileSizeBytes: input.bytesLength,
      durationSeconds: durationKnown ? (input.durationSeconds as number) : null,
      minBytesRequired: MIN_PLAYABLE_VIDEO_BYTES,
    },
  };
}
